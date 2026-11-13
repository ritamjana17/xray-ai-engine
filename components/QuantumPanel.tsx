"use client";

import { useEffect, useState } from "react";
import { classifyImage, MODEL, type QuantumPrediction } from "@/lib/quantum/classifier";

interface Props {
  imageBase64: string;
  /** Known dataset label when the image is one of the built-in samples */
  knownFractured?: boolean;
  onShowModel: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function QuantumPanel({ imageBase64, knownFractured, onShowModel }: Props) {
  // Result is tagged with the image it belongs to, so a new image shows the loading state
  const [state, setState] = useState<{ src: string; pred?: QuantumPrediction; error?: string } | null>(null);
  const current = state?.src === imageBase64 ? state : null;
  const pred = current?.pred ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let alive = true;
    classifyImage(imageBase64)
      .then((p) => alive && setState({ src: imageBase64, pred: p }))
      .catch(() => alive && setState({ src: imageBase64, error: "The quantum classifier could not read this image." }));
    return () => {
      alive = false;
    };
  }, [imageBase64]);

  const testAcc = MODEL.metrics.test.hybrid_quantum.accuracy;

  return (
    <section aria-label="Hybrid quantum model" className="mt-6 rounded-xl border border-line bg-surface-2/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-snug">Hybrid quantum model</p>
          <p className="mt-0.5 text-xs text-muted">
            {MODEL.nQubits} qubits &middot; {MODEL.nLayers} entangling layers &middot; runs in your browser
          </p>
        </div>
        <button onClick={onShowModel} className="shrink-0 text-xs font-medium text-accent hover:underline">
          How it works
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!pred && !error && <p className="mt-3 text-sm text-muted">Simulating the quantum circuit&hellip;</p>}

      {pred && (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-display text-3xl leading-none">
                {pred.label === "fracture" ? "Fracture" : "Normal"}
              </p>
              <p className="mt-1 text-xs text-muted">
                P(fracture) = {pct(pred.probability)}
              </p>
            </div>
            {knownFractured !== undefined && (
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                style={{
                  background:
                    (pred.label === "fracture") === knownFractured ? "rgba(47,168,79,.92)" : "rgba(229,57,42,.92)",
                }}
              >
                Dataset label: {knownFractured ? "fracture" : "normal"}{" "}
                {(pred.label === "fracture") === knownFractured ? "✓" : "✗"}
              </span>
            )}
          </div>

          {/* probability bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{
                width: pct(pred.probability),
                background: pred.label === "fracture" ? "#e5392a" : "#2fa84f",
              }}
            />
          </div>

          {/* qubit read-out */}
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-faint">Qubit read-out &lang;Z&rang;</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {pred.expectations.map((e, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface px-2 py-2 text-center">
                <p className="text-[11px] text-muted">q{i}</p>
                <div className="relative mx-auto mt-1 h-10 w-2 overflow-hidden rounded-full bg-fill">
                  <div
                    className="absolute left-0 w-full rounded-full bg-accent"
                    style={
                      e >= 0
                        ? { bottom: "50%", height: `${(e / 2) * 100}%` }
                        : { top: "50%", height: `${(-e / 2) * 100}%` }
                    }
                  />
                </div>
                <p className="mt-1 text-[11px] tabular-nums">{e.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* basis-state probabilities */}
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-faint">
            Measurement probabilities (16 basis states)
          </p>
          <div className="mt-2 flex h-14 items-end gap-[3px]" role="img" aria-label="Probability of each 4-qubit basis state">
            {pred.basisProbabilities.map((p, i) => {
              const max = Math.max(...pred.basisProbabilities);
              return (
                <div
                  key={i}
                  title={`|${i.toString(2).padStart(MODEL.nQubits, "0")}⟩  ${(p * 100).toFixed(1)}%`}
                  className="flex-1 rounded-t-sm bg-accent/80"
                  style={{ height: `${Math.max(2, (p / max) * 100)}%` }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>|0000&rang;</span>
            <span>|1111&rang;</span>
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            A separate, much smaller model than the AI report above: trained on {MODEL.dataset.total} X-rays (
            {MODEL.dataset.perClass} per class), {pct(testAcc)} accuracy on {MODEL.dataset.test} held-out images.
            Treat it as a research demo, not a diagnosis. Computed in {Math.round(pred.ms)} ms.
          </p>
        </>
      )}
    </section>
  );
}
