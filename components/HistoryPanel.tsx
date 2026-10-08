"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { HistoryEntry } from "@/lib/history";

interface Props {
  entries: HistoryEntry[];
  activeId: string | null;
  onOpen: (entry: HistoryEntry) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const SEV_COLOR: Record<string, string> = { high: "#e5392a", medium: "#f08c00", low: "#2fa84f", none: "#8e9aa4" };
const RANK: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

function topSeverity(e: HistoryEntry): string {
  const f = e.result.findings ?? [];
  if (f.length === 0) return "none";
  return f.reduce((b, x) => ((RANK[x.severity] ?? 0) > (RANK[b] ?? 0) ? x.severity : b), "none");
}

export function formatWhen(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export default function HistoryPanel({ entries, activeId, onOpen, onRename, onDelete, onClear, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.result.body_region?.toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  const commit = (id: string) => {
    const n = draft.trim();
    if (n) onRename(id, n);
    setEditingId(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0e1b24]/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.aside
        role="dialog"
        aria-label="Scan history"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div>
            <h2 className="font-display text-3xl leading-none">History</h2>
            <p className="mt-2 text-sm text-muted">
              {entries.length === 0 ? "Saved on this device only." : `${entries.length} saved on this device.`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close history" className="btn btn-secondary !h-8 !w-8 !px-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {entries.length > 4 && (
          <div className="px-6 pb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by patient or region"
              className="h-10 w-full rounded-xl border border-line-strong bg-surface-2/70 px-3.5 text-sm outline-none placeholder:text-faint focus:border-accent"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {entries.length === 0 ? (
            <div className="mx-2 mt-6 rounded-2xl border border-dashed border-line-strong p-8 text-center">
              <p className="font-semibold">Nothing saved yet</p>
              <p className="mt-1 text-sm text-muted">Every analysis is saved here automatically. Name it after the patient to find it later.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">No scans match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((e) => {
                const sev = topSeverity(e);
                const n = e.result.findings?.length ?? 0;
                const isEditing = editingId === e.id;
                return (
                  <li
                    key={e.id}
                    className={`group flex items-center gap-3 rounded-2xl p-2 transition-colors ${
                      e.id === activeId ? "bg-accent-soft" : "hover:bg-fill"
                    }`}
                  >
                    <button onClick={() => onOpen(e)} className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-viewer" aria-label={`Open ${e.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.thumb || e.image} alt="" className="h-full w-full object-cover" />
                    </button>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(ev) => setDraft(ev.target.value)}
                          onBlur={() => commit(e.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") commit(e.id);
                            if (ev.key === "Escape") setEditingId(null);
                          }}
                          className="h-8 w-full rounded-lg border border-accent bg-surface px-2 text-sm font-semibold outline-none"
                        />
                      ) : (
                        <button onClick={() => onOpen(e)} className="block w-full text-left">
                          <p className="truncate text-[15px] font-semibold">{e.name}</p>
                        </button>
                      )}
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs capitalize text-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEV_COLOR[sev] }} />
                        {e.result.body_region}, {n === 0 ? "clear" : `${n} ${n === 1 ? "finding" : "findings"}`}
                      </p>
                      <p className="text-xs text-faint">{formatWhen(e.createdAt)}</p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => { setEditingId(e.id); setDraft(e.name); }}
                        aria-label={`Rename ${e.name}`}
                        className="btn btn-ghost !h-7 !w-7 !px-0"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                      </button>
                      <button onClick={() => onDelete(e.id)} aria-label={`Delete ${e.name}`} className="btn btn-ghost !h-7 !w-7 !px-0 hover:!text-danger">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {entries.length > 0 && (
          <div className="border-t border-line px-6 py-3">
            {confirmClear ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Delete all {entries.length} scans?</span>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmClear(false)} className="btn btn-secondary">Cancel</button>
                  <button
                    onClick={() => { onClear(); setConfirmClear(false); }}
                    className="btn"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="btn btn-ghost !px-2 text-[13px]">Clear history</button>
            )}
          </div>
        )}
      </motion.aside>
    </motion.div>
  );
}
