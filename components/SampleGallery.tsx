"use client";

import { motion } from "framer-motion";
import { SAMPLES } from "@/lib/samples";

interface Props {
  onSelect: (samplePath: string, groundTruth?: unknown[]) => void;
  onClose: () => void;
}

export default function SampleGallery({ onSelect, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1b24]/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label="Sample X-rays"
        initial={{ scale: 0.97, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-3xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-7 pb-5 pt-6">
          <div>
            <h2 className="font-display text-3xl leading-none">Sample X-rays</h2>
            <p className="mt-2 text-sm text-muted">From public datasets (FracAtlas, Bone Fracture Multi-Region).</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-secondary !h-8 !w-8 !px-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="grid max-h-[65vh] grid-cols-2 gap-5 overflow-y-auto p-7 sm:grid-cols-3">
          {SAMPLES.map((sample) => (
            <button
              key={sample.filename}
              onClick={() => onSelect(`/samples/${sample.filename}`, sample.groundTruth)}
              className="group text-left"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-viewer ring-1 ring-line transition group-hover:ring-2 group-hover:ring-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/samples/${sample.filename}`}
                  alt={sample.label}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
                {sample.fractured !== undefined && (
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ background: sample.fractured ? "rgba(229,57,42,.92)" : "rgba(47,168,79,.92)" }}
                  >
                    {sample.fractured ? "Fracture" : "Normal"}
                  </span>
                )}
              </div>
              <p className="mt-2.5 truncate text-sm font-medium">{sample.label}</p>
              <p className="truncate text-xs text-muted">{sample.region}</p>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
