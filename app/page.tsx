"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import XrayCanvas from "@/components/XrayCanvas";
import FindingsList from "@/components/FindingsList";
import SampleGallery from "@/components/SampleGallery";
import HistoryPanel, { formatWhen } from "@/components/HistoryPanel";

import { AnalysisResult } from "@/lib/types";
import { resizeImage } from "@/lib/imageUtils";
import { SAMPLES } from "@/lib/samples";
import {
  HistoryEntry, listScans, saveScan, renameScan, deleteScan, clearScans, makeThumb, newId,
} from "@/lib/history";

const setGroundTruth = (gt?: unknown[]) => {
  (window as unknown as Record<string, unknown>).__groundTruth = gt;
};
const getGroundTruth = () =>
  (window as unknown as Record<string, unknown>).__groundTruth as unknown[] | undefined;

const STATUS = ["Preparing the image", "Locating areas of interest", "Rating severity", "Writing the summary"];

function AnalyzingStatus() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, STATUS.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-center" aria-live="polite">
      <p className="font-display text-3xl">Reading your scan</p>
      <p className="mt-2 text-sm text-muted">{STATUS[i]}&hellip;</p>
    </div>
  );
}

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRadiologistBoxes, setShowRadiologistBoxes] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [scanName, setScanName] = useState("");

  useEffect(() => {
    listScans().then(setHistory);
  }, []);

  const handleImageSelected = useCallback(async (file: File) => {
    setAnalysisResult(null);
    setCurrentImage(null);
    setCurrentId(null);
    setErrorMsg(null);

    let base64: string;
    try {
      base64 = await resizeImage(file, 1600, 0.88);
    } catch {
      setErrorMsg("We couldn't read that image. Try a JPG or PNG file.");
      return;
    }

    setCurrentImage(base64);
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      if (!data.is_xray) {
        setErrorMsg("This doesn't look like an X-ray. Upload a radiograph as a JPG or PNG.");
        setCurrentImage(null);
        return;
      }

      const id = newId();
      const region = String(data.body_region ?? "scan");
      const name = `${region.charAt(0).toUpperCase()}${region.slice(1)} scan`;
      setCurrentId(id);
      setScanName(name);
      setAnalysisResult(data);

      // Save to history in the background; never block the result on it.
      const groundTruth = getGroundTruth();
      makeThumb(base64)
        .catch(() => "")
        .then(async (thumb) => {
          const entry: HistoryEntry = { id, name, createdAt: Date.now(), image: base64, thumb, result: data, groundTruth };
          await saveScan(entry);
          setHistory((h) => [entry, ...h]);
        });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(`Analysis failed: ${msg}. Try again.`);
      setCurrentImage(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Own uploads must not inherit a previous sample's radiologist boxes
  const handleUpload = useCallback(
    (file: File) => {
      setGroundTruth(undefined);
      handleImageSelected(file);
    },
    [handleImageSelected]
  );

  const handleSampleSelected = useCallback(
    async (samplePath: string, groundTruth?: unknown[]) => {
      setShowSamples(false);
      try {
        const res = await fetch(samplePath);
        const blob = await res.blob();
        const file = new File([blob], samplePath.split("/").pop() || "sample.jpg", { type: blob.type });
        setGroundTruth(groundTruth ?? undefined);
        await handleImageSelected(file);
      } catch {
        setErrorMsg("We couldn't load that sample image.");
      }
    },
    [handleImageSelected]
  );

  const goHome = () => {
    setCurrentImage(null);
    setAnalysisResult(null);
    setCurrentId(null);
    setShowRadiologistBoxes(false);
    setErrorMsg(null);
  };

  const openFromHistory = (entry: HistoryEntry) => {
    setGroundTruth(entry.groundTruth);
    setShowRadiologistBoxes(false);
    setErrorMsg(null);
    setCurrentImage(entry.image);
    setAnalysisResult(entry.result);
    setCurrentId(entry.id);
    setScanName(entry.name);
    setShowHistory(false);
  };

  const rename = async (id: string, name: string) => {
    const n = name.trim() || "Untitled scan";
    if (id === currentId) setScanName(n);
    setHistory((h) => h.map((e) => (e.id === id ? { ...e, name: n } : e)));
    await renameScan(id, n);
  };

  const remove = async (id: string) => {
    setHistory((h) => h.filter((e) => e.id !== id));
    await deleteScan(id);
  };

  const clearAll = async () => {
    setHistory([]);
    await clearScans();
  };

  const showResult = analysisResult && currentImage;
  const showHome = !currentImage && !isAnalyzing;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      

      <header
        className="sticky top-0 z-40 border-b border-line backdrop-blur-xl"
        style={{ background: "var(--nav)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between px-5 lg:px-8">
          <button onClick={goHome} className="font-display text-[28px] leading-none tracking-tight" aria-label="Osteon home">
            Osteon
          </button>
          <nav className="flex items-center gap-1.5">
            <button onClick={() => setShowSamples(true)} className="btn btn-ghost">Samples</button>
            <button onClick={() => setShowHistory(true)} className="btn btn-secondary">
              History
              {history.length > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-[18px] text-accent-ink">
                  {history.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <AnimatePresence>
        {showSamples && <SampleGallery onSelect={handleSampleSelected} onClose={() => setShowSamples(false)} />}
        {showHistory && (
          <HistoryPanel
            entries={history}
            activeId={currentId}
            onOpen={openFromHistory}
            onRename={rename}
            onDelete={remove}
            onClear={clearAll}
            onClose={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-5 pb-12 pt-8 lg:px-8">
        {/* ---------------- Home ---------------- */}
        {showHome && (
          <div>
            <div className="grid items-center gap-10 pt-4 lg:grid-cols-[1.05fr_minmax(0,0.95fr)] lg:gap-16 lg:pt-10">
              <div>
                <h1 className="font-display text-balance text-[48px] leading-[1.02] tracking-[-0.01em] sm:text-[72px]">
                  Radiographs, read in seconds.
                </h1>
                <p className="mt-6 max-w-[480px] text-lg leading-relaxed text-muted">
                  Upload an X-ray. Osteon outlines each area of interest, rates how serious it looks, and
                  prepares a report you can save.
                </p>
                <ul className="mt-8 space-y-3 text-[15px]">
                  {[
                    ["Outlined regions", "Boxes drawn directly on the bone, hover to inspect."],
                    ["Severity and confidence", "Each finding rated high, medium or low."],
                    ["Saved to history", "Name each scan after the patient and reopen it any time."],
                  ].map(([t, d]) => (
                    <li key={t} className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span><span className="font-semibold">{t}.</span> <span className="text-muted">{d}</span></span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="card p-3">
                  <UploadZone isLoading={isAnalyzing} onFileSelected={handleUpload} />
                </div>
                {errorMsg && (
                  <div role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger/10 p-4 text-sm font-medium text-danger">
                    {errorMsg}
                  </div>
                )}
                <p className="mt-4 text-center text-[13px] text-faint">
                  Remove names and patient IDs from the image before uploading.
                </p>
              </div>
            </div>

            {history.length > 0 && (
              <section className="mt-16" aria-label="Recent scans">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="font-display text-3xl">Recent scans</h2>
                  <button onClick={() => setShowHistory(true)} className="text-sm font-medium text-accent hover:underline">
                    View all
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                  {history.slice(0, 6).map((e) => (
                    <button key={e.id} onClick={() => openFromHistory(e)} className="group text-left">
                      <div className="aspect-square overflow-hidden rounded-2xl bg-viewer ring-1 ring-line transition group-hover:ring-2 group-hover:ring-accent">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={e.thumb || e.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold">{e.name}</p>
                      <p className="truncate text-xs text-muted">{formatWhen(e.createdAt)}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {SAMPLES.length > 0 && (
              <section className="mt-14" aria-label="Samples">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="font-display text-3xl">Try a sample</h2>
                  <button onClick={() => setShowSamples(true)} className="text-sm font-medium text-accent hover:underline">
                    See all
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                  {SAMPLES.slice(0, 6).map((s) => (
                    <button
                      key={s.filename}
                      onClick={() => handleSampleSelected(`/samples/${s.filename}`, s.groundTruth)}
                      className="group text-left"
                    >
                      <div className="aspect-square overflow-hidden rounded-2xl bg-viewer ring-1 ring-line transition group-hover:ring-2 group-hover:ring-accent">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/samples/${s.filename}`}
                          alt={s.label}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                        />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium">{s.label}</p>
                      <p className="truncate text-xs text-muted">{s.region}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ---------------- Analyzing ---------------- */}
        {isAnalyzing && currentImage && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-viewer shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentImage} alt="X-ray being analyzed" className="block max-h-[55vh] w-full object-contain opacity-70 grayscale" />
              <div className="scan-line" />
            </div>
            <AnalyzingStatus />
          </div>
        )}

        {/* ---------------- Result ---------------- */}
        {showResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Toolbar: back + scan name */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button onClick={goHome} className="btn btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                Home
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <label htmlFor="scan-name" className="sr-only">Scan name</label>
                <input
                  id="scan-name"
                  value={scanName}
                  onChange={(e) => setScanName(e.target.value)}
                  onBlur={() => currentId && rename(currentId, scanName)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder="Name this scan, e.g. patient name"
                  className="h-10 w-full max-w-[380px] rounded-xl border border-transparent bg-transparent px-3 font-display text-[26px] leading-none outline-none transition hover:border-line-strong focus:border-accent focus:bg-surface"
                />
                <span className="hidden text-xs text-faint sm:inline">Saved to history</span>
              </div>
              <button onClick={goHome} className="btn btn-primary">New analysis</button>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
              <section className="card viewer-wrap p-3 sm:p-4" aria-label="Annotated image">
                <XrayCanvas
                  imageBase64={currentImage}
                  findings={analysisResult.findings ?? []}
                  summary={analysisResult.summary}
                  bodyRegion={analysisResult.body_region}
                  limitations={analysisResult.limitations}
                  showRadiologistBoxes={showRadiologistBoxes}
                  onToggleRadiologist={() => setShowRadiologistBoxes((v) => !v)}
                />
              </section>

              <aside
                className="card overflow-y-auto p-6 lg:sticky lg:top-[76px] lg:max-h-[calc(100svh-150px)]"
                aria-label="Report"
              >
                <span className="inline-block rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium capitalize text-accent">
                  {analysisResult.body_region}
                </span>
                <p className="mt-4 text-[16px] leading-relaxed">{analysisResult.summary}</p>
                <div className="my-6 h-px bg-line" />
                <FindingsList findings={analysisResult.findings ?? []} limitations={analysisResult.limitations} />
              </aside>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
