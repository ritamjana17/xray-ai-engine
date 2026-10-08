"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  isLoading: boolean;
  onFileSelected: (file: File) => void;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 10; // before client-side resize

export default function UploadZone({ isLoading, onFileSelected }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPT.includes(file.type)) return setError("Use a JPG, PNG, or WebP image.");
      if (file.size > MAX_SIZE_MB * 1024 * 1024)
        return setError(`That file is over ${MAX_SIZE_MB} MB. Choose a smaller image.`);
      setError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`relative flex flex-col items-center gap-6 rounded-[16px] border-[1.5px] border-dashed px-6 py-14 text-center transition-colors ${
          isDragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2/70"
        } ${isLoading ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          disabled={isLoading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {/* Film frame with corner brackets */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-xl bg-viewer text-white/90">
          <span className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2 border-white/50" />
          <span className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2 border-white/50" />
          <span className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-white/50" />
          <span className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-white/50" />
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14" />
          </svg>
        </div>

        <div>
          <p className="text-lg font-semibold tracking-tight">Drop an X-ray here</p>
          <p className="mt-1 text-sm text-muted">JPG, PNG or WebP, up to {MAX_SIZE_MB} MB</p>
        </div>
        <button onClick={() => inputRef.current?.click()} className="btn btn-primary btn-lg">
          Choose file
        </button>
      </div>
      {error && <p role="alert" className="mt-3 px-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
