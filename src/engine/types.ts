/* Core domain types for the Task Initiation Engine and app state. */

export type Domain =
  | "cleaning"
  | "writing"
  | "studying"
  | "email"
  | "admin"
  | "code"
  | "health"
  | "calls"
  | "creative"
  | "generic";

export type Difficulty = "easy" | "abit" | "hard" | "impossible";

export type StuckReason =
  | "unknown-next"
  | "too-big"
  | "distracted"
  | "tired"
  | "afraid"
  | "lost-interest"
  | "dont-want"
  | "dont-know";

export type EntryKind = "normal" | "ten" | "shrinker" | "overwhelm";

export type SessionKind = "focus" | "ten" | "micro";

export type Outcome = "kept" | "stopped" | "stuck";

export interface RescueResult {
  message: string;
  /** A replacement action, if the strategy changes the current step. */
  action?: string;
  /** A new shrink level, if the strategy shrinks the task. */
  level?: number;
  /** True when the strategy is a 60-second attention reset. */
  reset?: boolean;
}

export interface Draft {
  title: string;
  domain: Domain;
  /** 0 original … 4 the floor. */
  level: number;
  stepIndex: number;
  stepsDone: number;
  rescues: number;
  /** 0 until the first start of the current attempt. */
  startedAt: number;
  sessionId: string | null;
  kind: SessionKind;
  /** Overrides the current action (rescue strategies, AI-provided ladders). */
  override: string | null;
  ladderOverride: string[] | null;
}

export interface SessionRecord {
  id: string;
  title: string | null;
  domain: Domain;
  kind: SessionKind;
  startedAt: number;
  endedAt: number | null;
  seconds: number;
  steps: number;
  rescues: number;
  outcome: Outcome | null;
}

export type ThemeId = "pine" | "dawn" | "rain";

export interface Settings {
  theme: ThemeId;
  textScale: 100 | 112 | 125;
  reduceMotion: boolean;
  sound: boolean;
  doubleMsgs: boolean;
  saveTitles: boolean;
  aiEndpoint: string;
}

export type Screen =
  | { id: "home" }
  | { id: "threshold"; task: string }
  | { id: "micro" }
  | { id: "quick" }
  | { id: "shrinker" }
  | { id: "focus"; durationSec: number; bodyDouble: boolean }
  | { id: "rescue" }
  | { id: "reset"; returnTo: "focus" | "shrinker" }
  | { id: "complete" }
  | { id: "overwhelm" }
  | { id: "progress" }
  | { id: "settings" }
  | { id: "about" };

export interface Persisted {
  v: 1;
  sessions: SessionRecord[];
  pending: Draft | null;
  settings: Settings;
  lastVisit: number;
}
