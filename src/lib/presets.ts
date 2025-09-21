// src/lib/presets.ts
export type PatternSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  steps: number;
  bpm: number;
  octave: number;
  pitch: number;
  grid: boolean[][];
  fx: any;             // estructura del snapshot de FX; puedes tiparlo más si quieres
  sampleUrl?: string;  // blob/url del sample opcional
};

const KEY = "flplay_patterns_v1";

function readAll(): PatternSnapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PatternSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function listLocalPatterns(): PatternSnapshot[] {
  return readAll();
}

export function saveLocalPattern(p: PatternSnapshot): void {
  const all = readAll();
  all.push(p);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function loadLocalPattern(id: string): PatternSnapshot | null {
  const all = readAll();
  return all.find((x) => x.id === id) ?? null;
}
