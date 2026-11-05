import type { CheckResponse } from "@/app/result-card";

// Recent checks, kept only in this phone's browser: nothing is sent to or stored on our server.
// Storage can be unavailable (private mode) or full, so every access is guarded and the page
// works without it.

export type HistoryEntry = {
  id: string;
  savedAt: string;
  text: string;
  thumbnail: string | null; // small JPEG data URL of the checked image, if there was one
  result: CheckResponse;
};

const KEY = "verifier.history";
const EVENT = "verifier-history";
const VERSION = 1; // bump if the saved shape changes, so old entries are dropped instead of breaking the page
const MAX_ENTRIES = 20;

type Saved = { version: number; entries: HistoryEntry[] };

const EMPTY: HistoryEntry[] = [];
let cachedRaw: string | null = null;
let cachedEntries: HistoryEntry[] = EMPTY;

// useSyncExternalStore needs the same array back until storage actually changes.
export function readHistory(): HistoryEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw === cachedRaw) return cachedEntries;
  cachedRaw = raw;
  try {
    const saved: Saved | null = raw ? JSON.parse(raw) : null;
    cachedEntries = saved?.version === VERSION && Array.isArray(saved.entries) ? saved.entries : EMPTY;
  } catch {
    cachedEntries = EMPTY;
  }
  return cachedEntries;
}

export function emptyHistory(): HistoryEntry[] {
  return EMPTY;
}

export function subscribeToHistory(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(entries: HistoryEntry[]) {
  // If storage is full, keep dropping the oldest entries until it fits.
  for (let kept = entries; kept.length > 0; kept = kept.slice(0, -1)) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: VERSION, entries: kept } satisfies Saved));
      break;
    } catch {}
  }
  window.dispatchEvent(new Event(EVENT));
}

// Newest first. Checking the same text again moves it to the top instead of adding a duplicate.
export function addToHistory(entry: Omit<HistoryEntry, "id" | "savedAt">): string {
  const isRepeat = (e: HistoryEntry) => !entry.thumbnail && !e.thumbnail && e.text === entry.text;
  const fresh: HistoryEntry = { ...entry, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
  write([fresh, ...readHistory().filter((e) => !isRepeat(e))].slice(0, MAX_ENTRIES));
  return fresh.id;
}

export function removeFromHistory(id: string) {
  write(readHistory().filter((e) => e.id !== id));
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// A small copy of the image so the list is recognisable without storing the full photo.
export async function makeThumbnail(image: Blob, size = 160): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
