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

/** Pre-start state check: what is blocking initiation right now. */
export type Blocker =
  | "too-big"
  | "unclear"
  | "boring"
  | "perfectionism"
  | "anxiety"
  | "distracted"
  | "tired"
  | "avoiding"
  | "dont-know";

export type EntryKind =
  | "normal"
  | "ten"
  | "shrinker"
  | "overwhelm"
  | "onetap"
  | "statecheck"
  | "recover";

export type SessionKind = "focus" | "ten" | "micro";

export type Outcome = "kept" | "stopped" | "stuck";

export type ThemeId = "pine" | "dawn" | "rain";

export interface RescueResult {
  message: string;
  /** A replacement action, if the strategy changes the current step. */
  action?: string;
  /** A new shrink level, if the strategy shrinks the task. */
  level?: number;
  /** True when the strategy is a 60-second attention reset. */
  reset?: boolean;
}

/** Intervention chosen by the “Why can't I start?” state check. */
export interface Intervention {
  headline: string;
  action: string;
  reset?: boolean;
  levelShift: number;
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
  /** Overrides the current action (rescue strategies, AI ladders, plans). */
  override: string | null;
  ladderOverride: string[] | null;
  /** How the current attempt entered the system. */
  entry: EntryKind;
  /** Blocker named in the state check, if any. */
  blocker: Blocker | null;
  /** Last rescue strategy applied — feeds the personal profile. */
  lastStrategy: StuckReason | null;
  /** Short human rationale shown above the next action. */
  note: string | null;
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
  /** Step size used (shrink level). Added for adaptive learning. */
  level?: number;
  /** Chosen session length in seconds. */
  duration?: number;
  /** How this session was entered. */
  entry?: EntryKind;
  /** Named blocker, if the state check ran. */
  blocker?: Blocker | null;
  /** Rescue strategy that preceded the outcome, if any. */
  strategy?: StuckReason | null;
}

/** Patterns learned locally from the user's own sessions. */
export interface Profile {
  starts: number;
  bestLevel: number | null;
  bestDuration: number | null;
  bestStrategy: StuckReason | null;
  commonBlocker: Blocker | null;
  confidence: "none" | "low" | "enough";
}

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
  | { id: "onestep" }
  | { id: "statecheck" }
  | { id: "recover" }
  | { id: "focus"; durationSec: number; bodyDouble: boolean }
  | { id: "rescue" }
  | { id: "reset"; returnTo: "focus" | "shrinker" | "onestep" }
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
