import { AnalysisResult } from "@/lib/types";

export interface HistoryEntry {
  id: string;
  name: string;
  createdAt: number;
  image: string; // compressed JPEG data URL (the one sent for analysis)
  thumb: string;
  result: AnalysisResult;
  groundTruth?: unknown[];
}

const DB_NAME = "osteon";
const STORE = "scans";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listScans(): Promise<HistoryEntry[]> {
  try {
    const all = await run<HistoryEntry[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveScan(entry: HistoryEntry): Promise<void> {
  try { await run("readwrite", (s) => s.put(entry)); } catch { /* storage unavailable */ }
}

export async function renameScan(id: string, name: string): Promise<void> {
  try {
    const entry = await run<HistoryEntry | undefined>("readonly", (s) => s.get(id));
    if (entry) await run("readwrite", (s) => s.put({ ...entry, name }));
  } catch { /* ignore */ }
}

export async function deleteScan(id: string): Promise<void> {
  try { await run("readwrite", (s) => s.delete(id)); } catch { /* ignore */ }
}

export async function clearScans(): Promise<void> {
  try { await run("readwrite", (s) => s.clear()); } catch { /* ignore */ }
}

export function makeThumb(dataUrl: string, size = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
