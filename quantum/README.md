# Hybrid quantum-classical fracture classifier

This folder holds the Python side of the project: building the dataset and
training the hybrid quantum-classical model. The website runs the trained model
in the browser (see `lib/quantum/`), so none of this is needed just to use the site.

## Files

| File | What it does |
|---|---|
| `prepare_dataset.py` | Builds the balanced dataset: **100 images per class** (fractured / normal), downsized to max 512 px, grayscale JPEG, de-duplicated, stratified 70/30 train/test split. Writes `public/samples/` and `lib/samples.ts`. |
| `features.py` | Classical feature extractor (51 features per X-ray). Mirrored exactly in `lib/quantum/features.ts`. |
| `train_hybrid.py` | Trains the hybrid model with PennyLane + PyTorch, compares it with classical baselines, exports `lib/quantum/model.json`, and writes `results/`. |
| `results/` | `metrics.json`, `training_curve.png`, `confusion_matrix.png`, `circuit.png`, `circuit.txt`. |

## Model

A "dressed quantum circuit" (Mari et al., *Transfer learning in hybrid classical-quantum neural networks*, Quantum 4, 340, 2020):

```
X-ray (any size)
  -> 128x128 grayscale -> 51 classical features
       intensity stats (5), intensity histogram (8), Sobel edge stats (3),
       edge-orientation histogram (8), Laplacian energy (1),
       4x4 edge-density grid (16), uniform LBP texture histogram (10)
  -> standardise
  -> CLASSICAL encoder   Linear(51 -> 4), tanh, x pi/2        (208 weights)
  -> QUANTUM circuit     4 qubits                             (36 weights)
        AngleEmbedding: RY(angle_i) on qubit i
        3 x StronglyEntanglingLayers: Rot(phi, theta, omega) on every qubit + CNOT ring
        measure <Z> on each qubit
  -> CLASSICAL decoder   Linear(4 -> 1), sigmoid -> P(fracture)  (5 weights)
```

All 249 weights are trained together end to end (Adam, full batch, 100 steps,
L2 weight decay 0.05, binary cross-entropy). Gradients go through the quantum circuit
by exact back-propagation on PennyLane's `default.qubit` simulator.

## Dataset

| Source | Fractured | Normal |
|---|---|---|
| FracAtlas (CC-BY 4.0), with radiologist boxes for every fracture | 50 | 50 |
| Bone Fracture Multi-Region X-ray (Kaggle) | 50 | 50 |
| **Total** | **100** | **100** |

* FracAtlas: images with metal implants, several scans per file, or mixed regions are excluded.
  Normal images are chosen to match the body-region mix of the fractured ones
  (32 hand, 17 leg, 1 hip per class), so the model can't cheat by learning "hand vs leg".
* Bone Fracture Multi-Region contains many augmented copies; exact duplicates (MD5) and near
  duplicates (average-hash distance <= 4) are removed across the whole dataset.
* Split: 70 train / 30 test per class (stratified by dataset), seed 42.
* Size on disk: 1.9 MB for all 200 images (was 27 MB for 35 images before).

## Results (held-out test set, 60 images)

| Model | Accuracy | Sensitivity | Specificity | AUC | 5-fold CV accuracy |
|---|---|---|---|---|---|
| **Hybrid quantum-classical** | **65.0%** | 76.7% | 53.3% | 0.66 | 59.0% ± 3.4 |
| Classical twin (quantum layer replaced by Linear 4->4 + tanh) | 51.7% | 63.3% | 40.0% | 0.60 | 61.5% ± 5.8 |
| Logistic regression | 63.3% | 66.7% | 60.0% | 0.66 | 64.0% ± 4.6 |

How to read this:

* On the fixed test split, the hybrid model does best. Across 5-fold cross-validation
  the three models are within noise of each other, so we **don't** claim a quantum
  advantage. The fair conclusion: a 4-qubit hybrid model is competitive with
  classical models of the same size on this task.
* The training curves show that the classical twin memorises the training set
  (99% train accuracy, 52% test), while the quantum layer overfits less (89% train, 65% test).
  With only 140 training images, the bounded, unitary quantum layer seems to act as a regulariser.
* Accuracy is modest for every model. Fracture detection from 100 images per class is hard;
  published CNNs use thousands of images. Detecting the fracture itself is left to the
  Gemini vision model in the website. The quantum model is a second, independent opinion.

## Reproduce

```bash
pip install -r quantum/requirements.txt
python quantum/prepare_dataset.py --fracatlas "path/to/FracAtlas.zip" --bonefx "path/to/Bone Fracture Multi-Region X-ray Data.zip"
python quantum/train_hybrid.py
node scripts/check-quantum.mjs
```

The last command checks that the website's TypeScript simulator (`lib/quantum/circuit.ts`)
gives the same probabilities as PennyLane. They currently agree to about 1e-16.
