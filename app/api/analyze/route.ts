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
export const maxDuration = 30; // Vercel function timeout (seconds)

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

    // Call Gemini with fallback logic
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-omni-1.1-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-flash",
      "gemini-3.5-flash",
    ];

    let lastError: any;
    let rawText = "";
    const errorDetails: string[] = [];

    for (const modelName of modelsToTry) {
      let attempts = 0;
      let success = false;
      
      while (attempts < 2 && !success) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  { text: SYSTEM_PROMPT },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Data,
                    },
                  },
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
            },
          });

          rawText = response.text ?? "";
          
          if (rawText) {
            success = true;
            break; // Break the while loop
          }
        } catch (err: any) {
          lastError = err;
          
          const errMsg = err?.message || JSON.stringify(err);
          
          // If it's a 503 Unavailable, we can retry after a short delay
          if (err?.status === 503 || errMsg.includes("503") || errMsg.includes("high demand")) {
            console.warn(`[/api/analyze] Model ${modelName} 503 High Demand. Retrying...`);
            attempts++;
            if (attempts < 2) {
               await new Promise(res => setTimeout(res, 2000)); // Wait 2 seconds
            } else {
               errorDetails.push(`${modelName}: 503 High Demand`);
            }
          } else {
            console.warn(`[/api/analyze] Model ${modelName} failed with non-retriable error.`);
            errorDetails.push(`${modelName}: ${err?.status} ${errMsg.substring(0, 80)}`);
            break; // Break the while loop to move to the next model
          }
        }
      }
      
      // If we succeeded with this model, break out of the fallback loop
      if (success) {
        break;
      }
    }

    try {
      if (!rawText) {
        throw new Error(`All models failed. Details: ${errorDetails.join(" | ")}`);
      }

      // Extract JSON from the response (model sometimes wraps in markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Model refused to answer or returned invalid JSON. Output: "${rawText.substring(0, 150)}..."`);
      }

      const result: AnalysisResult = JSON.parse(jsonMatch[0]);
      return NextResponse.json(result);
    } catch (parseError: unknown) {
      console.error("Parse error:", parseError, rawText);
      const msg =
        parseError instanceof Error
          ? parseError.message
          : "Unknown parse error";
      return NextResponse.json(
        { error: `Failed to parse AI response: ${msg}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("API error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${msg}` },
      { status: 500 }
    );
  }
}
