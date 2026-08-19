import type { Persisted, Settings } from "../engine/types";

const KEY = "unstick:v1";

export const DEFAULT_SETTINGS: Settings = {
  theme: "pine",
  textScale: 100,
  reduceMotion: false,
  sound: true,
  doubleMsgs: true,
  saveTitles: true,
  aiEndpoint: "",
};

export function loadPersisted(): Persisted {
  const fallback: Persisted = {
    v: 1,
    sessions: [],
    pending: null,
    settings: DEFAULT_SETTINGS,
    lastVisit: Date.now(),
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      v: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      pending: parsed.pending ?? null,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      lastVisit: typeof parsed.lastVisit === "number" ? parsed.lastVisit : Date.now(),
    };
  } catch {
    return fallback;
  }
}

export function savePersisted(data: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode or full storage — the app keeps working in memory */
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function exportData(data: Persisted): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unstick-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/** Two soft notes — gentle, never celebratory fireworks. */
export function chime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.7);
    };
    play(659.25, 0);
    play(880, 0.18);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio unavailable — silence is fine */
  }
}
