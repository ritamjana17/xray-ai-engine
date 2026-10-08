import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Finding } from "@/lib/types";
import { geminiBoxToPixels } from "@/lib/imageUtils";

interface Props {
  imageBase64: string;
  findings: Finding[];
  summary: string;
  bodyRegion: string;
  limitations: string;
  showRadiologistBoxes: boolean;
  onToggleRadiologist: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "#ff3b30",
  medium: "#ff9f0a",
  low: "#30d158",
  none: "#94a3b8",
};

export default function XrayCanvas({
  imageBase64,
  findings,
  summary,
  bodyRegion,
  limitations,
  showRadiologistBoxes,
  onToggleRadiologist,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [animStep, setAnimStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image
  useEffect(() => {
    setLoaded(false);
    setAnimStep(0);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = imageBase64;
  }, [imageBase64]);

  // Animate boxes in one by one
  useEffect(() => {
    if (!loaded || findings.length === 0) {
      setAnimStep(findings.length);
      return;
    }
    setAnimStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setAnimStep(step);
      if (step >= findings.length) clearInterval(interval);
    }, 350);
    return () => clearInterval(interval);
  }, [loaded, findings]);

  // Draw everything on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;

    const container = containerRef.current;
    const maxW = container?.clientWidth ?? 600;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw findings boxes up to animStep
    findings.slice(0, animStep).forEach((f, i) => {
      const { x, y, w, h } = geminiBoxToPixels(
        f.box_2d,
        canvas.width,
        canvas.height
      );
      const color = SEVERITY_COLORS[f.severity] ?? "#94a3b8";
      const isActive = i === activeIdx || i === hoveredIdx;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.setLineDash(isActive ? [] : [6, 3]);
      ctx.globalAlpha = isActive ? 1 : 0.85;
      ctx.strokeRect(x, y, w, h);

      // Label background
      const label = `${i + 1}. ${f.label}`;
      ctx.font = `bold ${isActive ? 13 : 12}px sans-serif`;
      const textW = ctx.measureText(label).width + 8;
      const textH = 18;
      ctx.fillStyle = color;
      ctx.globalAlpha = isActive ? 0.95 : 0.8;
      ctx.fillRect(x, y - textH, textW, textH);

      // Label text
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 1;
      ctx.fillText(label, x + 4, y - 4);
      ctx.restore();
    });
  }, [loaded, findings, animStep, hoveredIdx, activeIdx]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on window resize
  useEffect(() => {
    const obs = new ResizeObserver(() => draw());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [draw]);

  // Hit-test mouse position against findings boxes
  const hitTest = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      for (let i = findings.length - 1; i >= 0; i--) {
        const { x, y, w, h } = geminiBoxToPixels(
          findings[i].box_2d,
          canvas.width,
          canvas.height
        );
        if (mx >= x && mx <= x + w && my >= y && my <= y + h) return i;
      }
      return null;
    },
    [findings]
  );

  // Download annotated image
  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "xray-analysis.jpg";
    link.href = canvas.toDataURL("image/jpeg", 0.92);
    link.click();
  };

  // Download full HTML report
  const handleDownloadReport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Diagnostic Imaging Report</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; margin: 40px auto; max-width: 800px; color: #111; line-height: 1.6; padding: 0 20px; }
          h1 { border-bottom: 2px solid #2563eb; padding-bottom: 10px; color: #1e3a8a; }
          h2 { color: #1e3a8a; margin-top: 30px; }
          .header { text-align: center; margin-bottom: 40px; }
          .image-container { text-align: center; margin-bottom: 30px; }
          img { max-width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
          .section { margin-bottom: 30px; }
          .finding { background: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin-bottom: 15px; border-radius: 4px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
          .severity-high { border-left-color: #ef4444; background: #fef2f2; }
          .severity-medium { border-left-color: #f59e0b; background: #fffbeb; }
          .severity-low { border-left-color: #22c55e; background: #f0fdf4; }
          .severity-none { border-left-color: #94a3b8; }
          .footer { margin-top: 50px; font-size: 0.85em; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;}
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-left: 10px; }
          .bg-high { background: #fee2e2; color: #991b1b; }
          .bg-medium { background: #fef3c7; color: #92400e; }
          .bg-low { background: #dcfce3; color: #166534; }
          .bg-none { background: #f1f5f9; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Diagnostic Imaging Report</h1>
          <p><strong>Anatomical Region:</strong> ${bodyRegion}</p>
          <p><strong>Date Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="image-container">
          <img src="${dataUrl}" alt="Annotated X-Ray" />
          <p style="font-size: 0.8em; color: #64748b; margin-top: 8px;">(Boxes indicate AI-detected areas of interest)</p>
        </div>

        <div class="section">
          <h2>Summary</h2>
          <p>${summary}</p>
        </div>

        <div class="section">
          <h2>Detailed Findings</h2>
          ${findings.map((f, i) => `
            <div class="finding severity-${f.severity}">
              <strong>${i+1}. ${f.label}</strong> 
              <span class="badge bg-${f.severity}">${f.severity}</span>
              <span class="badge" style="background: #e0e7ff; color: #3730a3;">${Math.round(f.confidence * 100)}% Conf.</span>
              <br/>
              <p style="margin-top: 8px; margin-bottom: 0;">${f.description}</p>
            </div>
          `).join("")}
          ${findings.length === 0 ? '<p>No significant abnormalities detected.</p>' : ''}
        </div>

        <div class="section">
          <h2>Limitations & Suggestions</h2>
          <p><em>${limitations}</em></p>
        </div>

        <div class="footer">
          Generated by AI X-Ray Analysis Engine.<br/>
          <strong>Educational demo only — not a medical device. Always consult a qualified physician.</strong><br/>
          <span style="font-size: 0.9em; margin-top: 5px; display: inline-block;">You can press Ctrl+P (or Cmd+P) to save this report as a PDF.</span>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Xray_Report_${new Date().getTime()}.html`;
    link.click();
  };

  const hasGroundTruth =
    typeof window !== "undefined" &&
    Array.isArray(
      (window as unknown as Record<string, unknown>).__groundTruth
    );

  return (
    <div className="space-y-4">
      {/* Viewer */}
      <div ref={containerRef} className="overflow-hidden rounded-[22px] bg-viewer">
        {!loaded ? (
          <div className="flex h-72 items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-7 w-7 rounded-full border-2 border-white/80 border-t-transparent"
            />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="mx-auto h-auto w-full cursor-crosshair"
            onMouseMove={(e) => setHoveredIdx(hitTest(e))}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={(e) => {
              const idx = hitTest(e);
              setActiveIdx((prev) => (prev === idx ? null : idx));
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-1">
        <div className="flex items-center gap-4 text-[13px] text-muted">
          {(["high", "medium", "low"] as const).map((sev) => (
            <span key={sev} className="flex items-center gap-1.5 capitalize">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[sev] }} />
              {sev}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        {hasGroundTruth && (
          <button
            onClick={onToggleRadiologist}
            aria-pressed={showRadiologistBoxes}
            className={`btn ${showRadiologistBoxes ? "btn-primary" : "btn-secondary"}`}
          >
            {showRadiologistBoxes ? "Hide radiologist" : "Compare with radiologist"}
          </button>
        )}
        <button onClick={handleDownloadImage} className="btn btn-secondary">Save image</button>
        <button onClick={handleDownloadReport} className="btn btn-primary">Download report</button>
      </div>
    </div>
  );
}
