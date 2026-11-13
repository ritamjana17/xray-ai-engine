// Verifies that the website's TypeScript quantum simulator reproduces the
// PennyLane-trained model exactly.  model.json stores a few "probe" images:
// their features and the probability PennyLane computed for them.
//
//   node scripts/check-quantum.mjs      (Node 22.18+ / 23.6+, runs .ts natively)

import { readFileSync } from "node:fs";
import { forward } from "../lib/quantum/hybrid.ts";
import { runCircuit } from "../lib/quantum/circuit.ts";

const model = JSON.parse(readFileSync(new URL("../lib/quantum/model.json", import.meta.url), "utf8"));
let ok = true;

// 1. sanity: |0000> with no rotations gives <Z> = +1 everywhere, probabilities sum to 1
const zero = runCircuit([0, 0, 0, 0], [[[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]]);
const total = zero.probabilities.reduce((a, b) => a + b, 0);
if (Math.abs(total - 1) > 1e-12 || zero.expectations.some((e) => Math.abs(e - 1) > 1e-12)) {
  console.error("FAIL basic state-vector sanity check");
  ok = false;
}

// 2. probes: TypeScript forward pass vs PennyLane
for (const p of model.probes) {
  const ts = forward(model, p.features).probability;
  const diff = Math.abs(ts - p.probability);
  const pass = diff < 1e-9;
  ok &&= pass;
  console.log(
    `${pass ? "ok  " : "FAIL"} ${p.filename.padEnd(28)} PennyLane ${p.probability.toFixed(6)}  TypeScript ${ts.toFixed(6)}  |diff| ${diff.toExponential(1)}`
  );
}

console.log(ok ? "\nTypeScript simulator matches PennyLane." : "\nMismatch!");
process.exitCode = ok ? 0 : 1;
