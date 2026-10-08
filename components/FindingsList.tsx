"use client";

import { Finding } from "@/lib/types";

interface Props {
  findings: Finding[];
  limitations: string;
}

const SEV: Record<string, { color: string; label: string; rank: number }> = {
  high: { color: "#e5392a", label: "High", rank: 3 },
  medium: { color: "#f08c00", label: "Medium", rank: 2 },
  low: { color: "#2fa84f", label: "Low", rank: 1 },
  none: { color: "#8e9aa4", label: "None", rank: 0 },
};

export default function FindingsList({ findings, limitations }: Props) {
  const top = findings.reduce<string | null>(
    (best, f) => ((SEV[f.severity]?.rank ?? 0) > (best ? SEV[best]?.rank ?? 0 : -1) ? f.severity : best),
    null
  );
  const topSev = top ? SEV[top] ?? SEV.none : null;

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-5xl leading-none">
            {findings.length === 0 ? "Clear" : findings.length}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {findings.length === 0 ? "No areas of concern" : findings.length === 1 ? "area of interest" : "areas of interest"}
          </p>
        </div>
        {topSev && (
          <span className="flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium">
            <span className="h-2 w-2 rounded-full" style={{ background: topSev.color }} />
            Highest: {topSev.label}
          </span>
        )}
      </div>

      {findings.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {findings.map((f, i) => {
            const s = SEV[f.severity] ?? SEV.none;
            const pct = Math.round(f.confidence * 100);
            return (
              <li key={i} className="relative overflow-hidden rounded-xl border border-line bg-surface-2/60 py-3.5 pl-5 pr-4">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: s.color }} />
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold leading-snug">
                    <span className="mr-1.5 text-muted">{i + 1}.</span>
                    {f.label}
                  </p>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ background: s.color }}
                  >
                    {s.label}
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{f.description}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-fill">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted">{pct}% confidence</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {limitations && (
        <p className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4 text-[13px] leading-relaxed text-muted">
          <span className="font-semibold text-fg">Limitations. </span>
          {limitations}
        </p>
      )}
    </div>
  );
}
