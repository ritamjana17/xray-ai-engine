"""
features.py - classical feature extractor (the "classical" half of the hybrid model).

Every step here is mirrored line-for-line in  lib/quantum/features.ts  so the
website computes exactly the same 51 numbers in the browser.  If you change
anything here, change it there too and re-run  train_hybrid.py.

Pipeline
    gray image (any size, 0-255)
      -> area-average resize to 128x128, scale to [0, 1]
      -> 51 hand-crafted radiograph features:
           5  intensity statistics (mean, std, p10, p50, p90)
           8  intensity histogram
           3  edge strength statistics (Sobel on contrast-normalised image)
           8  edge orientation histogram (magnitude weighted)
           1  Laplacian energy (sharp discontinuities, e.g. fracture lines)
          16  4x4 grid of local edge density (where the edges are)
          10  uniform Local Binary Pattern histogram (bone texture)
"""

from __future__ import annotations

import numpy as np

SIZE = 128
FEATURE_NAMES = (
    ["mean", "std", "p10", "p50", "p90"]
    + [f"hist_{i}" for i in range(8)]
    + ["edge_mean", "edge_std", "edge_strong_frac"]
    + [f"orient_{i}" for i in range(8)]
    + ["laplacian"]
    + [f"edge_grid_{r}{c}" for r in range(4) for c in range(4)]
    + [f"lbp_{i}" for i in range(10)]
)
N_FEATURES = len(FEATURE_NAMES)  # 51


def area_resize(img: np.ndarray, size: int = SIZE) -> np.ndarray:
    """Box-filter (area average) resize of a 2-D float array to size x size."""
    h, w = img.shape

    def weights(n_in: int) -> np.ndarray:
        m = np.zeros((size, n_in), dtype=np.float64)
        scale = n_in / size
        for i in range(size):
            a, b = i * scale, (i + 1) * scale
            for s in range(int(np.floor(a)), min(n_in, int(np.ceil(b)))):
                ov = min(b, s + 1) - max(a, s)
                if ov > 0:
                    m[i, s] = ov / scale
        return m

    return weights(h) @ img @ weights(w).T


def percentile(sorted_vals: np.ndarray, q: float) -> float:
    idx = q * (len(sorted_vals) - 1)
    lo = int(np.floor(idx))
    hi = min(lo + 1, len(sorted_vals) - 1)
    return float(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo))


def extract_features(gray: np.ndarray) -> np.ndarray:
    """gray: 2-D array of 0-255 values. Returns float64 vector of length 51."""
    a = area_resize(gray.astype(np.float64)) / 255.0
    flat = a.flatten()
    n = flat.size

    mean = flat.sum() / n
    std = np.sqrt(((flat - mean) ** 2).sum() / n)
    srt = np.sort(flat)
    f = [mean, std, percentile(srt, 0.10), percentile(srt, 0.50), percentile(srt, 0.90)]

    # intensity histogram
    bins = np.minimum(7, np.floor(flat * 8).astype(int))
    hist = np.bincount(bins, minlength=8) / n
    f += hist.tolist()

    # contrast-normalised image, Sobel gradients on the interior
    z = (a - mean) / (std + 1e-6)
    gx = np.zeros_like(z)
    gy = np.zeros_like(z)
    gx[1:-1, 1:-1] = (
        (z[:-2, 2:] + 2 * z[1:-1, 2:] + z[2:, 2:]) - (z[:-2, :-2] + 2 * z[1:-1, :-2] + z[2:, :-2])
    )
    gy[1:-1, 1:-1] = (
        (z[2:, :-2] + 2 * z[2:, 1:-1] + z[2:, 2:]) - (z[:-2, :-2] + 2 * z[:-2, 1:-1] + z[:-2, 2:])
    )
    mag = np.sqrt(gx ** 2 + gy ** 2)
    inner = mag[1:-1, 1:-1].flatten()
    m_mean = inner.sum() / inner.size
    m_std = np.sqrt(((inner - m_mean) ** 2).sum() / inner.size)
    strong = (inner > 2.0).sum() / inner.size
    f += [m_mean, m_std, strong]

    # orientation histogram (unsigned, 0..pi), magnitude weighted
    ang = np.arctan2(gy[1:-1, 1:-1], gx[1:-1, 1:-1]).flatten()
    ang = np.where(ang < 0, ang + np.pi, ang)
    ob = np.minimum(7, np.floor(ang / np.pi * 8).astype(int))
    oh = np.bincount(ob, weights=inner, minlength=8)
    f += (oh / (oh.sum() + 1e-9)).tolist()

    # Laplacian energy
    lap = 4 * z[1:-1, 1:-1] - z[:-2, 1:-1] - z[2:, 1:-1] - z[1:-1, :-2] - z[1:-1, 2:]
    f.append(np.abs(lap).sum() / lap.size)

    # 4x4 grid of edge density (relative to the global mean)
    cell = SIZE // 4
    for r in range(4):
        for c in range(4):
            blk = mag[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell]
            f.append((blk.sum() / blk.size) / (m_mean + 1e-6))

    # uniform LBP (8 neighbours, radius 1) on the [0,1] image
    center = a[1:-1, 1:-1]
    offs = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]
    bits = [(a[1 + dy:SIZE - 1 + dy, 1 + dx:SIZE - 1 + dx] >= center).astype(int) for dy, dx in offs]
    ones = sum(bits)
    trans = sum(np.abs(bits[k] - bits[(k + 1) % 8]) for k in range(8))
    label = np.where(trans <= 2, ones, 9).flatten()
    lbp = np.bincount(label, minlength=10) / label.size
    f += lbp.tolist()

    out = np.asarray(f, dtype=np.float64)
    assert out.size == N_FEATURES
    return out
