"use client";

import { motion } from "framer-motion";
import { MODEL } from "@/lib/quantum/classifier";

interface Props {
  onClose: () => void;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const ROWS: { key: keyof typeof MODEL.metrics.test; name: string; note: string }[] = [
  { key: "hybrid_quantum", name: "Hybrid quantum-classical", note: "this model" },
  { key: "classical_twin", name: "Classical twin network", note: "quantum layer swapped for a classical one" },
  { key: "logistic_regression", name: "Logistic regression", note: "classical baseline" },
];

export default function ModelInfo({ onClose }: Props) {
  const m = MODEL.metrics;
  const steps = [
    ["X-ray", "Downscaled to 128 × 128, grayscale"],
    ["Classical features", `${MODEL.featureNames.length} values: intensity, edges, edge direction, texture (LBP)`],
    ["Classical encoder", `Linear ${MODEL.featureNames.length} → ${MODEL.nQubits}, tanh, scaled to rotation angles`],
    [
      "Quantum circuit",
      `${MODEL.nQubits} qubits: RY angle embedding, then ${MODEL.nLayers} strongly entangling layers (Rot gates + CNOT ring), measure ⟨Z⟩ on each qubit`,
    ],
    ["Classical decoder", `Linear ${MODEL.nQubits} → 1, sigmoid → P(fracture)`],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b24]/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label="About the hybrid quantum model"
        initial={{ scale: 0.97, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-7 pb-5 pt-6">
          <div>
            <h2 className="font-display text-3xl leading-none">Hybrid quantum model</h2>
            <p className="mt-2 text-sm text-muted">
              A dressed variational quantum circuit trained with PennyLane and PyTorch, simulated exactly in your browser.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-secondary !h-8 !w-8 shrink-0 !px-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-7 overflow-y-auto px-7 py-6 text-[14px]">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Pipeline</h3>
            <ol className="mt-3 space-y-2">
              {steps.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      t === "Quantum circuit" ? "bg-accent text-accent-ink" : "bg-fill text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-semibold">{t}.</span> <span className="text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[13px] text-muted">
              {MODEL.params.total} trainable weights ({MODEL.params.quantum} quantum, {MODEL.params.classical} classical),
              all trained together end to end.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Dataset</h3>
            <p className="mt-2 text-muted">
              {MODEL.dataset.total} radiographs, {MODEL.dataset.perClass} fractured and {MODEL.dataset.perClass} normal,
              half from FracAtlas and half from Bone Fracture Multi-Region, with duplicates removed and body regions
              balanced. Stratified split: {MODEL.dataset.train} for training, {MODEL.dataset.test} held out for testing.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Results</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Test accuracy</th>
                    <th className="py-2 pr-3 font-medium">AUC</th>
                    <th className="py-2 font-medium">5-fold CV</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.key} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{r.name}</span>
                        <span className="block text-[11px] text-faint">{r.note}</span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{pct(m.test[r.key].accuracy)}</td>
                      <td className="py-2 pr-3 tabular-nums">{m.test[r.key].auc.toFixed(2)}</td>
                      <td className="py-2 tabular-nums">
                        {pct(m.crossValidation[r.key].mean)} ± {pct(m.crossValidation[r.key].std)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              Hybrid model on the test set: sensitivity {pct(m.test.hybrid_quantum.sensitivity)}, specificity{" "}
              {pct(m.test.hybrid_quantum.specificity)}. With only {MODEL.dataset.perClass} images per class, fracture
              detection is hard for any small model; the aim is to show a working hybrid pipeline and compare it fairly
              with classical models of the same size.
            </p>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
