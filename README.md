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

## Datasets
The application features a curated, built-in gallery of clinical samples so users can test the AI without providing their own images. These samples are derived from public medical datasets.

* **FracAtlas Dataset**
  Contains X-rays of hands, legs, hips, and shoulders with annotated bounding boxes for fractures.
  Link: https://www.kaggle.com/datasets/anandhuh/fracatlas

* **Bone Fracture Multi-Region X-Ray Data**
  Contains categorized normal and fractured radiographs across various anatomical regions.
  Link: https://www.kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data

### How the Datasets are Used
We extracted 35 optimized sample images from these datasets and placed them in the application's `public/samples` directory. For the FracAtlas dataset, the human-annotated YOLO coordinates (center X, center Y, width, height) were mathematically converted into the bounding box format required by the application. 

This enables a powerful **Compare Radiologist** feature. When testing one of the built-in FracAtlas samples, users can toggle a view that overlays the bounding boxes drawn by actual medical professionals directly against the AI's predictions, allowing for immediate accuracy grading.
