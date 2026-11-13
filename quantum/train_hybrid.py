"""
train_hybrid.py - train the hybrid quantum-classical fracture classifier.

Architecture ("dressed quantum circuit", Mari et al., Quantum 4, 340 (2020)):

    X-ray --> 51 classical image features (features.py)
          --> standardise
          --> CLASSICAL pre-net   Linear(51 -> 4) + tanh * pi/2        (encoder)
          --> QUANTUM circuit     4 qubits
                                  AngleEmbedding (RY) of the 4 values
                                  3 x StronglyEntanglingLayers (Rot + CNOT ring)
                                  measure <Z> on every qubit
          --> CLASSICAL post-net  Linear(4 -> 1) + sigmoid             (decoder)
          --> P(fracture)

Gradients flow through the quantum circuit (PennyLane + PyTorch), so the
classical and quantum weights are trained together, end to end.

For a fair comparison the script also trains
    * a purely classical twin network (quantum layer replaced by a
      Linear(4 -> 4) + tanh layer with the same number of weights), and
    * a logistic-regression baseline,
on exactly the same features and splits.

Outputs
    lib/quantum/model.json        weights used by the website (browser inference)
    quantum/results/metrics.json  all numbers
    quantum/results/*.png         training curve, confusion matrix, circuit diagram

Usage (from the project root):
    pip install -r quantum/requirements.txt
    python quantum/train_hybrid.py
"""

from __future__ import annotations

import csv
import json
import math
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import pennylane as qml
import torch
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, roc_auc_score
from sklearn.model_selection import StratifiedKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import FEATURE_NAMES, N_FEATURES, SIZE, extract_features  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "public" / "samples"
RESULTS = Path(__file__).resolve().parent / "results"
MODEL_JSON = ROOT / "lib" / "quantum" / "model.json"

N_QUBITS = 4
N_LAYERS = 3
EPOCHS = 100          # full-batch optimisation steps
LR = 0.05
WEIGHT_DECAY = 0.05   # strong L2: only 140 training images
SEED = 7
CV_FOLDS = 5


# ----------------------------------------------------------------------------
# quantum circuit
# ----------------------------------------------------------------------------
dev = qml.device("default.qubit", wires=N_QUBITS)


@qml.qnode(dev, interface="torch", diff_method="backprop")
def circuit(inputs, weights):
    qml.AngleEmbedding(inputs, wires=range(N_QUBITS), rotation="Y")
    qml.StronglyEntanglingLayers(weights, wires=range(N_QUBITS))
    return [qml.expval(qml.PauliZ(w)) for w in range(N_QUBITS)]


class HybridNet(torch.nn.Module):
    def __init__(self, quantum: bool = True):
        super().__init__()
        self.quantum = quantum
        self.pre = torch.nn.Linear(N_FEATURES, N_QUBITS)
        if quantum:
            self.q = qml.qnn.TorchLayer(circuit, {"weights": (N_LAYERS, N_QUBITS, 3)})
        else:  # classical twin with the same width
            self.q = torch.nn.Sequential(torch.nn.Linear(N_QUBITS, N_QUBITS), torch.nn.Tanh())
        self.post = torch.nn.Linear(N_QUBITS, 1)

    def forward(self, x):
        angles = torch.tanh(self.pre(x)) * (math.pi / 2)
        z = self.q(angles)
        return self.post(z).squeeze(-1)  # logit


def train_model(Xtr, ytr, quantum=True, seed=SEED, log=False):
    torch.manual_seed(seed)
    model = HybridNet(quantum).double()
    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    lossf = torch.nn.BCEWithLogitsLoss()
    X = torch.tensor(Xtr)
    y = torch.tensor(ytr, dtype=torch.float64)
    history = []
    # full-batch training: the 4-qubit circuit is evaluated on all training
    # images at once using PennyLane's parameter broadcasting
    for ep in range(EPOCHS):
        opt.zero_grad()
        logits = model(X)
        loss = lossf(logits, y)
        loss.backward()
        opt.step()
        acc = ((logits.detach() > 0).double() == y).double().mean().item()
        history.append((loss.item(), acc))
        if log and (ep % 25 == 0 or ep == EPOCHS - 1):
            print(f"    step {ep:3d}  loss {loss.item():.4f}  train acc {acc:.3f}")
    return model, history


def predict(model, X):
    with torch.no_grad():
        return torch.sigmoid(model(torch.tensor(X))).numpy()


def scores(y, p):
    pred = (p >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "accuracy": float((tp + tn) / len(y)),
        "sensitivity": float(tp / (tp + fn)) if tp + fn else 0.0,   # recall on fractures
        "specificity": float(tn / (tn + fp)) if tn + fp else 0.0,
        "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
        "auc": float(roc_auc_score(y, p)),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


# ----------------------------------------------------------------------------
def main():
    t0 = time.time()
    RESULTS.mkdir(exist_ok=True)
    rows = list(csv.DictReader(open(SAMPLES / "manifest.csv")))
    print(f"Extracting features from {len(rows)} images ...")
    X = np.array([extract_features(np.asarray(Image.open(SAMPLES / r["filename"]).convert("L"))) for r in rows])
    y = np.array([int(r["label"]) for r in rows])
    is_train = np.array([r["split"] == "train" for r in rows])
    print(f"  {X.shape[0]} images x {X.shape[1]} features "
          f"(train {is_train.sum()}, test {(~is_train).sum()}, "
          f"fractured {y.sum()}, normal {(1 - y).sum()})")

    def standardise(Xa, Xb):
        mu, sd = Xa.mean(0), Xa.std(0) + 1e-8
        return (Xa - mu) / sd, (Xb - mu) / sd, mu, sd

    # ---------------- 5-fold cross-validation on all 200 images -------------
    print(f"\n{CV_FOLDS}-fold cross-validation (hybrid vs classical twin vs logistic regression)")
    cv = {"hybrid_quantum": [], "classical_twin": [], "logistic_regression": []}
    skf = StratifiedKFold(CV_FOLDS, shuffle=True, random_state=SEED)
    for k, (a, b) in enumerate(skf.split(X, y)):
        Xa, Xb, _, _ = standardise(X[a], X[b])
        qm, _ = train_model(Xa, y[a], True)
        cm, _ = train_model(Xa, y[a], False)
        lr = LogisticRegression(C=0.1, max_iter=5000).fit(Xa, y[a])
        cv["hybrid_quantum"].append(scores(y[b], predict(qm, Xb))["accuracy"])
        cv["classical_twin"].append(scores(y[b], predict(cm, Xb))["accuracy"])
        cv["logistic_regression"].append(float(lr.score(Xb, y[b])))
        print(f"  fold {k + 1}: hybrid {cv['hybrid_quantum'][-1]:.3f}  "
              f"classical {cv['classical_twin'][-1]:.3f}  logreg {cv['logistic_regression'][-1]:.3f}")
    cv_summary = {k: {"mean": float(np.mean(v)), "std": float(np.std(v)), "folds": v} for k, v in cv.items()}
    for k, v in cv_summary.items():
        print(f"  {k:20s} {v['mean']:.3f} +/- {v['std']:.3f}")

    # ---------------- final model on the fixed train / test split -----------
    print("\nTraining final hybrid model on the train split ...")
    Xtr, Xte, mu, sd = standardise(X[is_train], X[~is_train])
    qmodel, qhist = train_model(Xtr, y[is_train], True, log=True)
    cmodel, chist = train_model(Xtr, y[is_train], False)
    lr = LogisticRegression(C=0.1, max_iter=5000).fit(Xtr, y[is_train])

    test = {
        "hybrid_quantum": scores(y[~is_train], predict(qmodel, Xte)),
        "classical_twin": scores(y[~is_train], predict(cmodel, Xte)),
        "logistic_regression": scores(y[~is_train], lr.predict_proba(Xte)[:, 1]),
    }
    train_acc = scores(y[is_train], predict(qmodel, Xtr))["accuracy"]
    print("\nHeld-out test set (60 images):")
    for k, v in test.items():
        print(f"  {k:20s} acc {v['accuracy']:.3f}  sens {v['sensitivity']:.3f}  "
              f"spec {v['specificity']:.3f}  AUC {v['auc']:.3f}")

    # ---------------- export weights for the website ------------------------
    sdict = {k: v.detach().numpy() for k, v in qmodel.state_dict().items()}
    n_q_params = N_LAYERS * N_QUBITS * 3
    n_params = sum(p.numel() for p in qmodel.parameters())
    test_idx = np.where(~is_train)[0]
    probe_idx = np.concatenate([test_idx[y[test_idx] == 1][:3], test_idx[y[test_idx] == 0][:3]])
    probe_p = predict(qmodel, (X[probe_idx] - mu) / sd)
    model = {
        "version": 1,
        "description": "Hybrid quantum-classical fracture classifier (dressed quantum circuit)",
        "featureSize": SIZE,
        "featureNames": FEATURE_NAMES,
        "featureMean": mu.tolist(),
        "featureStd": sd.tolist(),
        "nQubits": N_QUBITS,
        "nLayers": N_LAYERS,
        "pre": {"weight": sdict["pre.weight"].tolist(), "bias": sdict["pre.bias"].tolist()},
        "quantumWeights": sdict["q.weights"].tolist(),
        "post": {"weight": sdict["post.weight"][0].tolist(), "bias": float(sdict["post.bias"][0])},
        "params": {"total": int(n_params), "quantum": n_q_params, "classical": int(n_params - n_q_params)},
        "dataset": {
            "perClass": int(y.sum()),
            "total": int(len(y)),
            "train": int(is_train.sum()),
            "test": int((~is_train).sum()),
        },
        "metrics": {
            "test": test,
            "trainAccuracy": train_acc,
            "crossValidation": {k: {"mean": v["mean"], "std": v["std"]} for k, v in cv_summary.items()},
        },
        # used by scripts/check-quantum.mjs to prove the browser matches PennyLane
        "probes": [
            {"filename": rows[i]["filename"], "features": X[i].tolist(), "probability": float(p)}
            for i, p in zip(probe_idx, probe_p)
        ],
    }
    MODEL_JSON.parent.mkdir(parents=True, exist_ok=True)
    MODEL_JSON.write_text(json.dumps(model, separators=(",", ":")))
    print(f"\nWrote {MODEL_JSON.relative_to(ROOT)}")

    json.dump(
        {
            "config": {"qubits": N_QUBITS, "layers": N_LAYERS, "epochs": EPOCHS, "lr": LR,
                       "weight_decay": WEIGHT_DECAY, "batch": "full", "seed": SEED},
            "dataset": model["dataset"],
            "test": test,
            "train_accuracy": train_acc,
            "cross_validation": cv_summary,
            "parameters": model["params"],
        },
        open(RESULTS / "metrics.json", "w"),
        indent=2,
    )

    # ---------------- figures -------------------------------------------------
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(1, 2, figsize=(10, 3.6))
        ax[0].plot([h[0] for h in qhist], label="hybrid quantum")
        ax[0].plot([h[0] for h in chist], label="classical twin", alpha=0.7)
        ax[0].set_title("Training loss (BCE)")
        ax[0].set_xlabel("epoch")
        ax[0].legend()
        ax[1].plot([h[1] for h in qhist], label="hybrid quantum")
        ax[1].plot([h[1] for h in chist], label="classical twin", alpha=0.7)
        ax[1].set_title("Training accuracy")
        ax[1].set_xlabel("epoch")
        ax[1].legend()
        fig.tight_layout()
        fig.savefig(RESULTS / "training_curve.png", dpi=130)

        c = test["hybrid_quantum"]["confusion"]
        m = np.array([[c["tn"], c["fp"]], [c["fn"], c["tp"]]])
        fig, ax = plt.subplots(figsize=(3.8, 3.4))
        ax.imshow(m, cmap="Blues")
        for i in range(2):
            for j in range(2):
                ax.text(j, i, m[i, j], ha="center", va="center", fontsize=14)
        ax.set_xticks([0, 1], ["normal", "fracture"])
        ax.set_yticks([0, 1], ["normal", "fracture"])
        ax.set_xlabel("predicted")
        ax.set_ylabel("actual")
        ax.set_title("Hybrid model - test set")
        fig.tight_layout()
        fig.savefig(RESULTS / "confusion_matrix.png", dpi=130)

        fig, _ = qml.draw_mpl(circuit, decimals=2, level="device")(
            torch.zeros(N_QUBITS, dtype=torch.float64), qmodel.q.weights.detach()
        )
        fig.savefig(RESULTS / "circuit.png", dpi=110, bbox_inches="tight")
        public = ROOT / "public" / "model"          # figures shown in the website's model dialog
        public.mkdir(parents=True, exist_ok=True)
        for name in ("circuit.png", "training_curve.png", "confusion_matrix.png"):
            shutil.copy(RESULTS / name, public / name)
        print("Wrote quantum/results/*.png and public/model/*.png")
    except Exception as e:  # matplotlib is optional
        print(f"(skipped figures: {e})")

    drawing = qml.draw(circuit, decimals=1, level="device")(torch.zeros(N_QUBITS, dtype=torch.float64), qmodel.q.weights.detach())
    (RESULTS / "circuit.txt").write_text(drawing + chr(10), encoding="utf-8")
    print(f"\nDone in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
