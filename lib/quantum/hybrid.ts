// Forward pass of the trained hybrid network (no browser APIs, no JSON import,
// so it can also be run from Node by scripts/check-quantum.mjs).

import { runCircuit } from "./circuit.ts";

export interface HybridWeights {
  featureMean: number[];
  featureStd: number[];
  pre: { weight: number[][]; bias: number[] };
  quantumWeights: number[][][];
  post: { weight: number[]; bias: number };
}

export function forward(model: HybridWeights, features: number[]) {
  const x = features.map((v, i) => (v - model.featureMean[i]) / model.featureStd[i]);
  // classical encoder: Linear(51 -> 4) + tanh, scaled to rotation angles
  const angles = model.pre.weight.map((row, q) => {
    let s = model.pre.bias[q];
    for (let i = 0; i < row.length; i++) s += row[i] * x[i];
    return Math.tanh(s) * (Math.PI / 2);
  });
  // quantum layer
  const { expectations, probabilities } = runCircuit(angles, model.quantumWeights);
  // classical decoder: Linear(4 -> 1) + sigmoid
  let logit = model.post.bias;
  expectations.forEach((e, i) => (logit += model.post.weight[i] * e));
  const probability = 1 / (1 + Math.exp(-logit));
  return { probability, angles, expectations, basisProbabilities: probabilities };
}
