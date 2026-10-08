# 🩻 AI X-ray Analyzer — Educational Demo

An AI-powered X-ray analysis web app built with **Next.js + Gemini Flash**.
Upload an X-ray, get a written analysis and animated bounding boxes — all for **free**.

> ⚠️ **This is an educational demo. It is NOT a medical device and cannot provide a real diagnosis.
> Always consult a qualified physician.**

---

## ✨ Features

- 🔬 AI visual analysis powered by Google Gemini Flash (free tier)
- 💬 ChatGPT-style chat interface
- 🎯 Animated bounding boxes drawn on the **original** image (not AI-generated)
- 🟥🟡🟢 Severity color coding (high / medium / low)
- 📥 Download annotated image
- 🌗 Dark / light theme
- 📷 Sample gallery with optional radiologist ground-truth boxes
- 🛡️ Rate limiting, file validation, no DICOM, no raw key exposure
- 📱 Mobile-responsive

---

## 🚀 Quick Start (Local)

### Step 1 — Prerequisites

- [Node.js 18+](https://nodejs.org) (you already have Node 24 ✅)
- A free Gemini API key (see below)

### Step 2 — Get a Free Gemini API Key

1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with any Google account
3. Click **Create API Key**
4. Copy the key (starts with `AIza...`)
5. ✅ **Do NOT add a billing account** — the free tier works without one
6. ✅ The free tier covers `gemini-2.0-flash` at ~5–15 req/min

### Step 3 — Install & Configure

```powershell
# Clone the repo (or open the project folder)
cd C:\Users\Muffin\.gemini\antigravity\scratch\xray-analyzer

# Install dependencies (already done if you ran setup)
npm install

# Create your local env file
copy .env.example .env.local
notepad .env.local
# → Replace  your_api_key_here  with your actual key, then save
```

### Step 4 — Add Sample Images (optional but recommended)

Follow the instructions in [`public/samples/README.md`](./public/samples/README.md).

### Step 5 — Run

```powershell
npm run dev
```

Open **http://localhost:3000** — the app is live!

---

## 📁 Project Structure

```
xray-analyzer/
├── app/
│   ├── api/
│   │   └── analyze/
│   │       └── route.ts       ← Serverless function (calls Gemini)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               ← Main UI
├── components/
│   ├── ChatBubble.tsx         ← Chat message with Markdown
│   ├── DisclaimerBanner.tsx   ← Sticky "not medical advice" banner
│   ├── FindingsList.tsx       ← Findings with severity badges
│   ├── SampleGallery.tsx      ← Modal gallery
│   ├── ThemeToggle.tsx        ← Dark/light switcher
│   ├── UploadZone.tsx         ← Drag-and-drop upload
│   └── XrayCanvas.tsx         ← Canvas annotation (the magic ✨)
├── lib/
│   ├── imageUtils.ts          ← Resize, coordinate conversion
│   ├── samples.ts             ← Sample image catalogue
│   └── types.ts               ← Shared TypeScript types
├── public/
│   └── samples/
│       └── README.md          ← How to download real X-rays
├── .env.example               ← Template (safe to commit)
├── .gitignore                 ← Excludes .env.local
├── next.config.ts
└── README.md
```

---

## 🌐 Deploy to Vercel (Free)

### Step 1 — Push to GitHub

```powershell
# Initialize git (already done by create-next-app)
git add .
git commit -m "Initial commit: AI X-ray Analyzer"

# Create a new repo on https://github.com/new  (name: xray-analyzer)
# Then connect it:
git remote add origin https://github.com/YOUR_USERNAME/xray-analyzer.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to **https://vercel.com** → Sign in with GitHub
2. Click **Add New Project**
3. Select your `xray-analyzer` repo
4. Click **Deploy** — Vercel auto-detects Next.js

### Step 3 — Add Environment Variable (CRITICAL)

1. In your Vercel project → **Settings → Environment Variables**
2. Add:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** your `AIza...` key
   - **Environment:** Production ✅ Preview ✅ Development ✅
3. Click **Save**
4. Go to **Deployments → Redeploy** to apply

Your app is now live at `https://xray-analyzer-xxx.vercel.app`! 🎉

---

## 🔑 API Key — Detailed Notes

| Question | Answer |
|---|---|
| Where to get it | https://aistudio.google.com/app/apikey |
| Cost | Free tier — no billing account needed |
| Model used | `gemini-2.0-flash` |
| Rate limit (free) | ~5–15 requests per minute |
| Does it use your data? | Free tier may use data to improve Google products — use only public images |
| How to keep key secret | Store in `.env.local` locally; Vercel env vars in production |

---

## 📦 Datasets

### Download Links

| Dataset | URL | License | Use |
|---|---|---|---|
| Bone Fracture Multi-Region | https://www.kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data | Check dataset page | Local samples |
| VinBigData Chest X-ray | https://www.kaggle.com/c/vinbigdata-chest-xray-abnormalities-detection | Competition rules | No public hosting |
| RSNA Pneumonia | https://www.kaggle.com/c/rsna-pneumonia-detection-challenge | Non-commercial/research | No public hosting |
| FracAtlas | https://figshare.com/articles/dataset/FracAtlas/22363012 | CC-BY 4.0 | Samples + ground-truth boxes |

**How to integrate:**
1. Download 15–30 images
2. Resize to max 600px (see `public/samples/README.md`)
3. Drop into `public/samples/`
4. Update `lib/samples.ts` with filenames and optional ground-truth boxes

---

## ⚙️ Configuration

Edit `.env.local`:

```env
GEMINI_API_KEY=AIzaSy...       # Required
RATE_LIMIT_WINDOW_MS=60000     # Optional: rate limit window in ms (default 60s)
RATE_LIMIT_MAX=5               # Optional: max requests per IP per window (default 5)
```

---

## ⚠️ Known Limitations

1. **Accuracy** — Gemini Flash is a general-purpose model, not a trained radiologist AI. Boxes may be imprecise.
2. **No DICOM** — Browsers can't read `.dcm` files natively. Convert to JPG first.
3. **Safety filters** — Gemini may refuse some images. Reframe as "educational" if refused.
4. **Rate limits** — Free tier is ~5–15 req/min. Heavy use will hit quota.
5. **Image size** — Images are resized client-side to ~1600px max to stay under Vercel's 4.5 MB limit.
6. **Privacy** — Remove patient headers from X-rays before uploading. Free API tier may use data.
7. **Not a medical device** — This is a student demo showing how AI could assist radiologists.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS v4
- **Animations:** Framer Motion
- **AI:** Google Gemini Flash via `@google/genai`
- **Markdown:** react-markdown + remark-gfm
- **Hosting:** Vercel (free tier)
- **Image annotation:** HTML Canvas (not AI image generation)

---

## 📄 Attribution

Sample images from:
- FracAtlas: Abedeen et al. (2023). CC-BY 4.0.
- Bone Fracture Multi-Region: bmadushanirodrigo on Kaggle.

Inspired by [Microsoft Project InnerEye](https://www.microsoft.com/en-us/research/project/project-inner-eye/).
