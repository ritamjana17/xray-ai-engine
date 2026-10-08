// ─── Shared TypeScript types ───────────────────────────────────────────────

export interface Finding {
  label: string;
  description: string;
  severity: "high" | "medium" | "low" | "none";
  confidence: number; // 0-1
  /** [ymin, xmin, ymax, xmax] in 0-1000 coordinate space */
  box_2d: [number, number, number, number];
}

export interface AnalysisResult {
  is_xray: boolean;
  body_region: string;
  summary: string;
  findings: Finding[];
  limitations: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageData?: string;       // base64 data URL for preview
  timestamp: number;
  analysisResult?: AnalysisResult;
}

export interface Sample {
  filename: string;
  label: string;
  region: string;
  fractured?: boolean;
  source?: string;
  /** Optional radiologist ground-truth boxes, same format as Finding */
  groundTruth?: {
    label: string;
    box_2d: [number, number, number, number];
  }[];
}
