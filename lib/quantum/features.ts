// Classical feature extractor - an exact TypeScript port of quantum/features.py.
// Any change here must be made in the Python file too (and the model retrained).

export const SIZE = 128;
export const N_FEATURES = 51;

/** Box-filter (area average) resize of a gray image (row-major) to size x size. */
export function areaResize(gray: Float64Array, w: number, h: number, size = SIZE): Float64Array {
  // horizontal pass: h rows x size cols
  const tmp = new Float64Array(h * size);
  const sx = w / size;
  for (let i = 0; i < size; i++) {
    const a = i * sx, b = (i + 1) * sx;
    const s0 = Math.floor(a), s1 = Math.min(w, Math.ceil(b));
    for (let s = s0; s < s1; s++) {
      const ov = Math.min(b, s + 1) - Math.max(a, s);
      if (ov <= 0) continue;
      const wt = ov / sx;
      for (let y = 0; y < h; y++) tmp[y * size + i] += gray[y * w + s] * wt;
    }
  }
  // vertical pass: size x size
  const out = new Float64Array(size * size);
  const sy = h / size;
  for (let i = 0; i < size; i++) {
    const a = i * sy, b = (i + 1) * sy;
    const s0 = Math.floor(a), s1 = Math.min(h, Math.ceil(b));
    for (let s = s0; s < s1; s++) {
      const ov = Math.min(b, s + 1) - Math.max(a, s);
      if (ov <= 0) continue;
      const wt = ov / sy;
      for (let x = 0; x < size; x++) out[i * size + x] += tmp[s * size + x] * wt;
    }
  }
  return out;
}

function percentile(sorted: Float64Array, q: number): number {
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** gray: 0-255 values, row-major, w x h. Returns the 51-feature vector. */
export function extractFeatures(gray: Float64Array, w: number, h: number): number[] {
  const S = SIZE;
  const a = areaResize(gray, w, h, S);
  const n = S * S;
  for (let i = 0; i < n; i++) a[i] /= 255;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i];
  const mean = sum / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (a[i] - mean) ** 2;
  const std = Math.sqrt(v / n);
  const srt = Float64Array.from(a).sort();
  const f: number[] = [mean, std, percentile(srt, 0.1), percentile(srt, 0.5), percentile(srt, 0.9)];

  // intensity histogram
  const hist = new Array(8).fill(0);
  for (let i = 0; i < n; i++) hist[Math.min(7, Math.floor(a[i] * 8))]++;
  for (const c of hist) f.push(c / n);

  // contrast-normalised image + Sobel
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = (a[i] - mean) / (std + 1e-6);
  const Z = (y: number, x: number) => z[y * S + x];
  const mag = new Float64Array(n);
  const gxA = new Float64Array(n);
  const gyA = new Float64Array(n);
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const gx =
        Z(y - 1, x + 1) + 2 * Z(y, x + 1) + Z(y + 1, x + 1) - (Z(y - 1, x - 1) + 2 * Z(y, x - 1) + Z(y + 1, x - 1));
      const gy =
        Z(y + 1, x - 1) + 2 * Z(y + 1, x) + Z(y + 1, x + 1) - (Z(y - 1, x - 1) + 2 * Z(y - 1, x) + Z(y - 1, x + 1));
      gxA[y * S + x] = gx;
      gyA[y * S + x] = gy;
      mag[y * S + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  // stats over the inner (S-2)x(S-2) region
  const m = (S - 2) * (S - 2);
  let ms = 0, strong = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const g = mag[y * S + x];
    ms += g;
    if (g > 2.0) strong++;
  }
  const mMean = ms / m;
  let mv = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) mv += (mag[y * S + x] - mMean) ** 2;
  f.push(mMean, Math.sqrt(mv / m), strong / m);

  // orientation histogram
  const oh = new Array(8).fill(0);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    let ang = Math.atan2(gyA[y * S + x], gxA[y * S + x]);
    if (ang < 0) ang += Math.PI;
    oh[Math.min(7, Math.floor((ang / Math.PI) * 8))] += mag[y * S + x];
  }
  const ohSum = oh.reduce((p, c) => p + c, 0) + 1e-9;
  for (const c of oh) f.push(c / ohSum);

  // Laplacian energy
  let lap = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    lap += Math.abs(4 * Z(y, x) - Z(y - 1, x) - Z(y + 1, x) - Z(y, x - 1) - Z(y, x + 1));
  }
  f.push(lap / m);

  // 4x4 edge-density grid
  const cell = S / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let y = r * cell; y < (r + 1) * cell; y++) for (let x = c * cell; x < (c + 1) * cell; x++) s += mag[y * S + x];
    f.push(s / (cell * cell) / (mMean + 1e-6));
  }

  // uniform LBP
  const offs = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
  const lbp = new Array(10).fill(0);
  const bits = new Array(8);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const c = a[y * S + x];
    let ones = 0;
    for (let k = 0; k < 8; k++) {
      bits[k] = a[(y + offs[k][0]) * S + x + offs[k][1]] >= c ? 1 : 0;
      ones += bits[k];
    }
    let trans = 0;
    for (let k = 0; k < 8; k++) trans += Math.abs(bits[k] - bits[(k + 1) % 8]);
    lbp[trans <= 2 ? ones : 9]++;
  }
  for (const c of lbp) f.push(c / m);

  return f;
}
