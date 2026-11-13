import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// ──────────────── Types ────────────────────────────────────────────────────────
interface Finding {
  label: string;
  description: string;
  severity: "high" | "medium" | "low" | "none";
  confidence: number;
  box_2d: [number, number, number, number];
}

interface AnalysisResult {
  is_xray: boolean;
  body_region: string;
  summary: string;
  findings: Finding[];
  limitations: string;
}

// ──────────────── Rate limiting (simple in-memory, per deployment) ─────────────
const ipTimestamps = new Map<string, number[]>();
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 5);

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipTimestamps.get(ip) ?? []).filter(
    (t) => now - t < WINDOW_MS
  );
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  ipTimestamps.set(ip, timestamps);
  return false;
}

// ──────────────── Gemini prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an AI assistant helping with an **educational demonstration** of how computer vision might support radiologists. This is NOT a medical device and will NOT be used for real clinical decisions.

When given an image:
1. First check if the image really is a medical X-ray. If it is NOT an X-ray (e.g. a person, an animal, a landscape, a document, or a generic photo), you MUST STILL RETURN VALID JSON. Set "is_xray" to false, set "body_region" to "N/A", "summary" to "This image does not appear to be a radiograph.", "findings" to [], and "limitations" to "N/A". DO NOT refuse the prompt.
2. If it IS an X-ray, set "is_xray" to true, and describe findings in plain, cautious language.
3. Never give a definitive diagnosis. Say "possible", "may indicate", "warrants attention".
4. Always recommend consulting a qualified medical professional.
5. Be honest about uncertainty. If you can't see something clearly, say so.
6. For bounding boxes use the 0-1000 coordinate system (ymin, xmin, ymax, xmax).

Return ONLY valid JSON matching this exact schema:
{
  "is_xray": boolean,
  "body_region": "string (e.g. 'Right wrist', 'Chest PA view', 'N/A')",
  "summary": "string (2-4 sentences, plain language)",
  "findings": [
    {
      "label": "string (short name, e.g. 'Possible fracture')",
      "description": "string (1-2 sentences)",
      "severity": "high|medium|low|none",
      "confidence": number (0.0 to 1.0),
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ],
  "limitations": "string (important caveats about this analysis)"
}`;

// ──────────────── Handler ──────────────────────────────────────────────────────
export const maxDuration = 60; // Vercel function timeout (seconds); leaves room for Gemini retries

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // 2. Auth check
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "API Key is missing. Check .env.local or Vercel Environment Variables.",
        },
        { status: 500 }
      );
    }

    // 3. Body parse
    const body = await req.json();
    if (!body.imageBase64) {
      return NextResponse.json(
        { error: "Missing imageBase64 in request body." },
        { status: 400 }
      );
    }

    // Strip data URI prefix if present
    const base64Data = body.imageBase64.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    // ── Call Gemini, falling back through several models ────────────────────
    // Vercel stops this function after `maxDuration` seconds and then sends a
    // plain-text error page, so we keep our own deadline below that and always
    // answer with JSON. Order = fastest reliable models first (measured Nov 2026
    // on the free tier). Override with GEMINI_MODELS="model-a,model-b".
    const models: { name: string; capMs: number }[] = process.env.GEMINI_MODELS
      ? process.env.GEMINI_MODELS.split(",").map((m) => ({ name: m.trim(), capMs: 25_000 }))
      : [
          { name: "gemini-3-flash-preview", capMs: 20_000 }, // ~6 s, good quality
          { name: "gemini-3.5-flash-lite", capMs: 12_000 }, // ~2 s, fast fallback
          { name: "gemini-3.8-flash", capMs: 10_000 }, // best, but often busy
          { name: "gemini-3.5-flash", capMs: 25_000 }, // slow (15-40 s)
          { name: "gemini-3.1-flash-lite", capMs: 25_000 },
        ];

    const started = Date.now();
    const DEADLINE_MS = 50_000; // < maxDuration (60 s)
    const ai = new GoogleGenAI({ apiKey });
    const errorDetails: string[] = [];

    for (const { name, capMs } of models) {
      const remaining = DEADLINE_MS - (Date.now() - started);
      if (remaining < 3_000) break;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(capMs, remaining));
      try {
        const response = await ai.models.generateContent({
          model: name,
          contents: [
            {
              role: "user",
              parts: [
                { text: SYSTEM_PROMPT },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } },
                {
                  text: "Analyze this image for the educational demo. Ensure you only return valid JSON based on the rules provided.",
                },
              ],
            },
          ],
          config: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            abortSignal: controller.signal,
          },
        });

        const rawText = response.text ?? "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/); // model sometimes wraps JSON in markdown
        if (!jsonMatch) throw new Error("returned no JSON");
        const result: AnalysisResult = JSON.parse(jsonMatch[0]);
        console.info(`[/api/analyze] ${name} answered in ${Date.now() - started} ms`);
        return NextResponse.json({ ...result, model: name });
      } catch (err: unknown) {
        // 503 busy, 429 out of quota, 404 retired, timeout, bad JSON: try the next model
        const e = err as { status?: number; message?: string; name?: string };
        const why = controller.signal.aborted
          ? "timed out"
          : `${e?.status ?? ""} ${(e?.message ?? String(err)).substring(0, 80)}`.trim();
        console.warn(`[/api/analyze] ${name} failed: ${why}`);
        errorDetails.push(`${name}: ${why}`);
      } finally {
        clearTimeout(timer);
      }
    }

    return NextResponse.json(
      {
        error:
          "The AI service is busy right now (Google's servers are overloaded or the free quota is used up). Please try again in a minute.",
        details: errorDetails,
      },
      { status: 503 }
    );
  } catch (error: unknown) {
    console.error("API error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${msg}` },
      { status: 500 }
    );
  }
}
