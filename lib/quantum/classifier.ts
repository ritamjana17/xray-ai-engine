// Hybrid quantum-classical fracture classifier - browser inference.
// Weights come from quantum/train_hybrid.py (PennyLane + PyTorch) via model.json.
//
//   features (51) -> standardise -> Linear(51->4) -> tanh * pi/2
//     -> 4-qubit circuit (AngleEmbedding + 3 StronglyEntanglingLayers) -> <Z> x 4
//     -> Linear(4->1) -> sigmoid -> P(fracture)

import model from "./model.json";
import { forward, type HybridWeights } from "./hybrid.ts";
import { extractFeatures } from "./features.ts";

export const MODEL = model;

export interface QuantumPrediction {
  probability: number; // P(fracture), 0-1
  label: "fracture" | "normal";
  angles: number[]; // encoder output = rotation angles fed to each qubit
  expectations: number[]; // <Z> measured on each qubit
  basisProbabilities: number[]; // |amplitude|^2 for the 16 basis states
  ms: number;
}

export function classifyFeatures(features: number[]): Omit<QuantumPrediction, "ms"> {
  const r = forward(model as HybridWeights, features);
  return { ...r, label: r.probability >= 0.5 ? "fracture" : "normal" };
}

/** Decode an image (data URL or path) into 0-255 grayscale values. Browser only. */
export function loadGray(src: string): Promise<{ gray: Float64Array; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);
      const gray = new Float64Array(w * h);
      // ITU-R 601 luma, same weights as PIL's convert("L")
      for (let i = 0; i < gray.length; i++) {
        gray[i] = (data[4 * i] * 299 + data[4 * i + 1] * 587 + data[4 * i + 2] * 114) / 1000;
      }
      resolve({ gray, w, h });
    };
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

export async function classifyImage(src: string): Promise<QuantumPrediction> {
  const t0 = performance.now();
  const { gray, w, h } = await loadGray(src);
  const result = classifyFeatures(extractFeatures(gray, w, h));
  return { ...result, ms: performance.now() - t0 };
}
