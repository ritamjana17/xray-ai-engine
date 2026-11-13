"""
prepare_dataset.py - build the balanced, downsized X-ray dataset.

Mentor requirement: 80-100 images per class.
This script builds exactly 100 "fractured" + 100 "normal" images
(50 per class from each public dataset), downsized to a max side of
512 px, saved as grayscale JPEG.  It also:

  * removes exact and near-duplicate images (the Bone Fracture
    Multi-Region set contains many augmented copies),
  * keeps body regions balanced between classes for FracAtlas so the model
    learns "fracture vs normal" and not "hand vs leg",
  * converts FracAtlas YOLO boxes to the app's 0-1000 [ymin,xmin,ymax,xmax]
    format (used by the "Compare radiologist" overlay),
  * makes a stratified 70 / 30 train / test split (fixed seed),
  * writes  public/samples/*.jpg,  public/samples/manifest.csv
    and  lib/samples.ts  (the gallery list used by the website).

Usage (from the project root):
    python quantum/prepare_dataset.py --fracatlas "path/FracAtlas.zip" \
        --bonefx "path/Bone Fracture Multi-Region X-ray Data.zip"
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import random
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

PER_CLASS_PER_SOURCE = 50          # 50 + 50 = 100 images per class
MAX_SIDE = 512                     # "downsize" requirement
JPEG_QUALITY = 85
TEST_FRACTION = 0.30
SEED = 42

ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = ROOT / "public" / "samples"
SAMPLES_TS = ROOT / "lib" / "samples.ts"


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def load_gray(data: bytes) -> Image.Image | None:
    """Decode to 8-bit grayscale; returns None for corrupt/truncated files."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return img.convert("L")
    except Exception:
        return None


def downsize(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(1.0, MAX_SIDE / max(w, h))
    if s < 1.0:
        img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return img


def ahash(img: Image.Image) -> int:
    """64-bit average hash, used to spot near-duplicate (augmented) images."""
    small = np.asarray(img.resize((8, 8), Image.BILINEAR), dtype=np.float32)
    bits = (small > small.mean()).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def yolo_to_box(line: str):
    p = line.split()
    if len(p) < 5:
        return None
    cx, cy, w, h = map(float, p[1:5])
    clamp = lambda v: int(max(0, min(1000, round(v * 1000))))
    return [clamp(cy - h / 2), clamp(cx - w / 2), clamp(cy + h / 2), clamp(cx + w / 2)]


class Picker:
    """Accepts images until `n` are collected, rejecting duplicates."""

    def __init__(self, global_hashes: list[int]):
        self.hashes = global_hashes
        self.md5s: set[str] = set()

    def accept(self, data: bytes, img: Image.Image | None) -> bool:
        if img is None:
            return False
        md5 = hashlib.md5(data).hexdigest()
        if md5 in self.md5s:
            return False
        h = ahash(img)
        if any(hamming(h, o) <= 4 for o in self.hashes):
            return False
        w, hgt = img.size
        if min(w, hgt) < 128:                       # too small to be useful
            return False
        if np.asarray(img).std() < 12:               # blank / near-uniform
            return False
        self.md5s.add(md5)
        self.hashes.append(h)
        return True


# ----------------------------------------------------------------------------
# FracAtlas
# ----------------------------------------------------------------------------
def pick_fracatlas(zip_path: Path, rng: random.Random, hashes: list[int]):
    z = zipfile.ZipFile(zip_path)
    rows = list(csv.DictReader(io.StringIO(z.read("FracAtlas/dataset.csv").decode())))

    def region(r):
        for k in ("hand", "leg", "hip", "shoulder"):
            if r[k] == "1":
                return k.capitalize()
        return "Bone"

    # YOLO annotations (fractured images only)
    yolo = {}
    for n in z.namelist():
        if n.startswith("FracAtlas/Annotations/YOLO/") and n.endswith(".txt"):
            boxes = [b for b in (yolo_to_box(l) for l in z.read(n).decode().splitlines()) if b]
            if boxes:
                yolo[Path(n).stem + ".jpg"] = boxes

    # skip images with metal implants / several scans in one file / mixed regions
    clean = [r for r in rows if r["hardware"] == "0" and r["mixed"] == "0" and r["multiscan"] == "0"]
    frac = [r for r in clean if r["fractured"] == "1" and r["image_id"] in yolo]
    norm = [r for r in clean if r["fractured"] == "0"]
    rng.shuffle(frac)
    rng.shuffle(norm)

    picker = Picker(hashes)
    out = []

    chosen_frac = []
    for r in frac:
        if len(chosen_frac) == PER_CLASS_PER_SOURCE:
            break
        data = z.read(f"FracAtlas/images/Fractured/{r['image_id']}")
        img = load_gray(data)
        if picker.accept(data, img):
            chosen_frac.append((r, img))

    # normals: match the region mix of the fractured picks
    need = defaultdict(int)
    for r, _ in chosen_frac:
        need[region(r)] += 1
    chosen_norm = []
    for r in norm:
        reg = region(r)
        if need[reg] <= 0:
            continue
        data = z.read(f"FracAtlas/images/Non_fractured/{r['image_id']}")
        img = load_gray(data)
        if picker.accept(data, img):
            chosen_norm.append((r, img))
            need[reg] -= 1
        if len(chosen_norm) == PER_CLASS_PER_SOURCE:
            break

    for r, img in chosen_frac:
        out.append(dict(img=img, fractured=True, source="FracAtlas", region=region(r),
                        origin=r["image_id"], gt=yolo[r["image_id"]]))
    for r, img in chosen_norm:
        out.append(dict(img=img, fractured=False, source="FracAtlas", region=region(r),
                        origin=r["image_id"], gt=None))
    return out


# ----------------------------------------------------------------------------
# Bone Fracture Multi-Region
# ----------------------------------------------------------------------------
def pick_bonefx(zip_path: Path, rng: random.Random, hashes: list[int]):
    z = zipfile.ZipFile(zip_path)
    by_class = {True: [], False: []}
    for n in z.namelist():
        if not n.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        folder = n.split("/")[-2].lower()
        if folder == "fractured":
            by_class[True].append(n)
        elif folder == "not fractured":
            by_class[False].append(n)

    out = []
    for cls in (True, False):
        names = sorted(by_class[cls])
        rng.shuffle(names)
        picker = Picker(hashes)
        got = 0
        for n in names:
            if got == PER_CLASS_PER_SOURCE:
                break
            data = z.read(n)
            img = load_gray(data)
            if picker.accept(data, img):
                out.append(dict(img=img, fractured=cls, source="BoneFX", region="Various",
                                origin=n.split("/", 2)[-1], gt=None))
                got += 1
    return out


# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fracatlas", required=True, type=Path)
    ap.add_argument("--bonefx", required=True, type=Path)
    args = ap.parse_args()

    rng = random.Random(SEED)
    hashes: list[int] = []
    items = pick_fracatlas(args.fracatlas, rng, hashes) + pick_bonefx(args.bonefx, rng, hashes)

    # stratified split by (source, class)
    groups = defaultdict(list)
    for it in items:
        groups[(it["source"], it["fractured"])].append(it)
    for g in groups.values():
        rng.shuffle(g)
        n_test = round(len(g) * TEST_FRACTION)
        for i, it in enumerate(g):
            it["split"] = "test" if i < n_test else "train"

    # write images
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    for old in SAMPLES_DIR.glob("*"):
        if old.suffix.lower() in (".jpg", ".jpeg", ".png"):
            old.unlink()

    counters = defaultdict(int)
    items.sort(key=lambda it: (it["source"] != "FracAtlas", not it["fractured"], it["origin"]))
    for it in items:
        key = (it["source"], it["fractured"])
        counters[key] += 1
        tag = "fractured" if it["fractured"] else "normal"
        it["filename"] = f"{it['source'].lower()}_{tag}_{counters[key]:03d}.jpg"
        downsize(it["img"]).save(SAMPLES_DIR / it["filename"], "JPEG",
                                 quality=JPEG_QUALITY, optimize=True)

    # manifest (used by train_hybrid.py)
    with open(SAMPLES_DIR / "manifest.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["filename", "label", "source", "region", "split", "original_file"])
        for it in items:
            w.writerow([it["filename"], int(it["fractured"]), it["source"], it["region"],
                        it["split"], it["origin"]])

    # lib/samples.ts (used by the website gallery)
    lines = [
        "// AUTO-GENERATED by quantum/prepare_dataset.py - do not edit by hand",
        "// Sources: FracAtlas (CC-BY 4.0) | Bone Fracture Multi-Region (Kaggle)",
        f"// {sum(1 for i in items if i['fractured'])} fractured + "
        f"{sum(1 for i in items if not i['fractured'])} normal images, max side {MAX_SIDE}px",
        'import { Sample } from "./types";',
        "",
        "export const SAMPLES: Sample[] = [",
    ]
    for it in items:
        n = int(it["filename"].rsplit("_", 1)[1].split(".")[0])
        if it["source"] == "FracAtlas":   # e.g. "Hand fracture #3", "Leg normal #7"
            label = f"{it['region']} {'fracture' if it['fractured'] else 'normal'} #{n}"
        else:                              # region not recorded in this dataset
            label = f"{'Fracture' if it['fractured'] else 'Normal'} #{n}"
        lines += [
            "  {",
            f'    filename: "{it["filename"]}",',
            f'    label: "{label}",',
            f'    region: "{it["region"]}",',
            f"    fractured: {'true' if it['fractured'] else 'false'},",
            f'    source: "{it["source"]}",',
            f'    split: "{it["split"]}",',
        ]
        if it["gt"]:
            lines.append("    groundTruth: [")
            for b in it["gt"]:
                lines.append(f'      {{ label: "Fracture (radiologist)", box_2d: [{b[0]}, {b[1]}, {b[2]}, {b[3]}] }},')
            lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    SAMPLES_TS.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # summary
    print(f"Wrote {len(items)} images to {SAMPLES_DIR}")
    for (src, cls), g in sorted(groups.items()):
        tr = sum(1 for i in g if i["split"] == "train")
        print(f"  {src:9s} {'fractured' if cls else 'normal   '}: {len(g)}  (train {tr}, test {len(g) - tr})")
    size = sum(p.stat().st_size for p in SAMPLES_DIR.glob("*.jpg"))
    print(f"Total size: {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
