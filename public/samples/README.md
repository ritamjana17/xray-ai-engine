# How to Download Sample X-rays

This folder should contain 15–30 small X-ray images (JPG, max ~500px wide).

## Option 1 — Bone Fracture Multi-Region Dataset (easiest)

1. Create a free Kaggle account at https://www.kaggle.com
2. Go to https://www.kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data
3. Click **Download** → you get a ZIP file
4. Unzip and pick 5–10 images from `Fractured/` and 5–10 from `Not Fractured/`
5. Resize them (PowerShell example below) and drop them here

## Option 2 — FracAtlas (has ground-truth boxes)

1. Search "FracAtlas" on Kaggle or visit https://figshare.com/articles/dataset/FracAtlas/22363012
2. Download and read the license — it is CC-BY 4.0, free for non-commercial use
3. The dataset includes JSON annotation files with bounding boxes per image
4. You can convert those boxes to the 0-1000 Gemini coordinate space and add them to `lib/samples.ts`

## Resize Script (PowerShell)

```powershell
# Install ImageMagick first: winget install ImageMagick.ImageMagick
Get-ChildItem -Filter "*.jpg" | ForEach-Object {
    magick $_.FullName -resize "600x600>" -quality 85 "resized_$($_.Name)"
}
```

## Rename convention

Use descriptive names matching `lib/samples.ts`:
- `hand_fracture_1.jpg`
- `wrist_fracture_1.jpg`
- `chest_normal_1.jpg`
- `ankle_fracture_1.jpg`
- `finger_fracture_1.jpg`
- `knee_normal_1.jpg`

## Attribution

Always include dataset attribution in the UI (the app footer credits Kaggle datasets).

**FracAtlas:** Abedeen et al. (2023). FracAtlas: A Dataset for Fracture Classification, Localization and Segmentation of Musculoskeletal Radiographs. Scientific Data. CC-BY 4.0.

**Bone Fracture Multi-Region:** bmadushanirodrigo on Kaggle. Check the dataset page for its current license.
