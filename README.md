# AI X-Ray Analysis Engine

## Overview
This project is an advanced, interactive educational web application that demonstrates the potential of multimodal Generative AI in the field of medical imaging. The system allows users to upload radiographic images (X-rays) or select from a built-in database of clinical samples. It processes the image using Google's vision models and returns a highly structured diagnostic report, complete with severity-coded bounding boxes drawn natively over the areas of concern.

**Disclaimer:** This project is strictly a conceptual and educational demonstration. It is not a certified medical device and is explicitly programmed to avoid providing definitive clinical diagnoses.

## How the Application Works
1. **Intelligent Uploading** 
   The application accepts standard image formats (JPEG, PNG, WebP). To ensure high-speed processing and minimize API bandwidth, the image is resized via HTML5 Canvas directly in the user's browser before it is sent to the server.
2. **AI Analysis & Architecture** 
   The resized image is securely sent to a Next.js serverless backend route (`/api/analyze`). The backend communicates with the Google Gemini API using a strict constraint (`responseMimeType: "application/json"`) and highly specific prompt engineering to force the AI to return raw JSON data instead of conversational text.
3. **Fallback Loop System** 
   To guarantee maximum uptime, the backend employs a cascading fallback matrix. If the primary model experiences a high-demand traffic spike, the server automatically pauses and retries, eventually dropping down to older legacy models to ensure a response is always returned.
4. **Visual Annotation** 
   The original image is never permanently altered or redrawn. The frontend extracts normalized spatial coordinates (on a 0 to 1000 scale) from the AI's JSON output. It scales these coordinates dynamically to match the user's screen size and paints interactive bounding boxes natively over the image using the HTML `<canvas>` API.
5. **PDF Reporting** 
   Users can instantly generate and download a comprehensively formatted HTML/PDF diagnostic report containing the annotated image and all findings.
6. **Hybrid Quantum-Classical Model** 
   Every scan also gets a second, independent opinion from a hybrid quantum-classical neural network: classical image features feed a 4-qubit variational quantum circuit, whose measurements are turned into a fracture probability. The model was trained with PennyLane and PyTorch, and the browser runs an exact state-vector simulation of the trained circuit, so it needs no server or API key. The result panel shows the prediction, each qubit's measured value and the 16 measurement probabilities. The **Quantum model** button explains the architecture and results.

## Datasets
The application has a built-in gallery of **200 clinical samples: 100 fractured and 100 normal** (80-100 per class, as required). These samples come from two public medical datasets, 50 per class from each.

* **FracAtlas Dataset** (CC-BY 4.0)
  X-rays of hands, legs, hips and shoulders with radiologist-annotated bounding boxes for fractures.
  Link: https://www.kaggle.com/datasets/anandhuh/fracatlas

* **Bone Fracture Multi-Region X-Ray Data**
  Categorized normal and fractured radiographs across various anatomical regions.
  Link: https://www.kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data

### How the Datasets are Used
`quantum/prepare_dataset.py` builds the sample set reproducibly:
* **Downsized**: every image is converted to grayscale JPEG with a maximum side of 512 px. All 200 images take 1.9 MB, down from 27 MB for the previous 35.
* **Balanced**: exactly 100 images per class. For FracAtlas, normal images are chosen to match the body-region mix of the fractured ones.
* **Cleaned**: exact and near-duplicate images are removed (the Bone Fracture set contains many augmented copies), along with images showing metal implants or several scans in one file.
* **Split**: a stratified 70/30 train/test split for the quantum model. Each image in the gallery is tagged `train` or `test`.

For FracAtlas, the human-annotated YOLO coordinates (center X, center Y, width, height) are converted into the app's bounding-box format. This powers the **Compare Radiologist** feature: on a FracAtlas fracture sample, users can overlay the boxes drawn by medical professionals on top of the AI's predictions.

## Hybrid Quantum-Classical Model
```
X-ray -> 51 classical image features -> Linear(51->4) + tanh   [classical encoder]
      -> 4-qubit circuit: RY angle embedding + 3 strongly entangling layers -> <Z> per qubit   [quantum]
      -> Linear(4->1) + sigmoid -> P(fracture)   [classical decoder]
```

| Model (same features, same split) | Test accuracy | AUC | 5-fold CV |
|---|---|---|---|
| **Hybrid quantum-classical** | **65.0%** | 0.66 | 59.0% ± 3.4 |
| Classical twin (quantum layer replaced by a classical layer) | 51.7% | 0.60 | 61.5% ± 5.8 |
| Logistic regression | 63.3% | 0.66 | 64.0% ± 4.6 |

Full details, honest interpretation, figures and reproduction steps: [`quantum/README.md`](quantum/README.md).

| Path | Purpose |
|---|---|
| `quantum/prepare_dataset.py` | Builds the 100-per-class dataset |
| `quantum/train_hybrid.py` | Trains and evaluates the hybrid model (PennyLane + PyTorch) |
| `quantum/results/` | Metrics, training curve, confusion matrix, circuit diagram |
| `lib/quantum/` | Browser inference: feature extractor, state-vector simulator, trained weights |
| `scripts/check-quantum.mjs` | Checks that the browser simulator matches PennyLane (`npm run check:quantum`) |

## Running Locally
```bash
npm install
cp .env.example .env.local   # then add your GEMINI_API_KEY
npm run dev
```
On Vercel, set `GEMINI_API_KEY` under Project Settings, then Environment Variables. The quantum model needs no configuration.
