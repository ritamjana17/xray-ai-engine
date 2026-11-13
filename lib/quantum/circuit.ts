// A tiny exact state-vector simulator for the variational quantum circuit.
// It reproduces PennyLane's default.qubit for:
//     qml.AngleEmbedding(x, rotation="Y") + qml.StronglyEntanglingLayers(weights)
//     -> [<Z_0>, <Z_1>, ..., <Z_{n-1}>]
// Conventions match PennyLane: wire 0 is the most significant bit of the
// basis-state index, Rot(phi, theta, omega) = RZ(omega) RY(theta) RZ(phi).

export class StateVector {
  readonly n: number;
  re: Float64Array;
  im: Float64Array;

  constructor(nQubits: number) {
    this.n = nQubits;
    const dim = 1 << nQubits;
    this.re = new Float64Array(dim);
    this.im = new Float64Array(dim);
    this.re[0] = 1; // |00...0>
  }

  private bit(wire: number) {
    return 1 << (this.n - 1 - wire);
  }

  /** Apply a general 2x2 complex matrix [[a,b],[c,d]] to one wire. */
  apply1(
    wire: number,
    aR: number, aI: number, bR: number, bI: number,
    cR: number, cI: number, dR: number, dI: number
  ) {
    const m = this.bit(wire);
    const { re, im } = this;
    for (let i = 0; i < re.length; i++) {
      if (i & m) continue;
      const j = i | m;
      const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];
      re[i] = aR * r0 - aI * i0 + bR * r1 - bI * i1;
      im[i] = aR * i0 + aI * r0 + bR * i1 + bI * r1;
      re[j] = cR * r0 - cI * i0 + dR * r1 - dI * i1;
      im[j] = cR * i0 + cI * r0 + dR * i1 + dI * r1;
    }
  }

  ry(wire: number, theta: number) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    this.apply1(wire, c, 0, -s, 0, s, 0, c, 0);
  }

  rz(wire: number, phi: number) {
    const c = Math.cos(phi / 2), s = Math.sin(phi / 2);
    this.apply1(wire, c, -s, 0, 0, 0, 0, c, s);
  }

  rot(wire: number, phi: number, theta: number, omega: number) {
    this.rz(wire, phi);
    this.ry(wire, theta);
    this.rz(wire, omega);
  }

  cnot(control: number, target: number) {
    const mc = this.bit(control), mt = this.bit(target);
    const { re, im } = this;
    for (let i = 0; i < re.length; i++) {
      if (i & mc && !(i & mt)) {
        const j = i | mt;
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
  }

  expZ(wire: number) {
    const m = this.bit(wire);
    let e = 0;
    for (let i = 0; i < this.re.length; i++) {
      const p = this.re[i] ** 2 + this.im[i] ** 2;
      e += i & m ? -p : p;
    }
    return e;
  }

  probabilities() {
    return Array.from(this.re, (r, i) => r * r + this.im[i] * this.im[i]);
  }
}

/** weights: [layer][qubit][3] */
export function runCircuit(inputs: number[], weights: number[][][]) {
  const n = inputs.length;
  const sv = new StateVector(n);
  // AngleEmbedding (RY)
  inputs.forEach((x, w) => sv.ry(w, x));
  // StronglyEntanglingLayers
  weights.forEach((layer, l) => {
    layer.forEach(([phi, theta, omega], w) => sv.rot(w, phi, theta, omega));
    if (n > 1) {
      const r = (l % (n - 1)) + 1;
      for (let w = 0; w < n; w++) sv.cnot(w, (w + r) % n);
    }
  });
  return {
    expectations: Array.from({ length: n }, (_, w) => sv.expZ(w)),
    probabilities: sv.probabilities(),
  };
}
