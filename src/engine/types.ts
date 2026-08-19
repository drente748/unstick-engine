/* ============================================================
   Engine + app domain types.

   The engine is an explicit reasoning pipeline:
   normalize → classify → complexity → friction → barrier
   hypothesis → capacity → size → candidates → score →
   guardrails → dedupe → select → explain → learn → profile.

   Every stage is a small pure function. The only source of
   truth for learning is the persisted SessionRecord list; the
   Profile is always re-derived, never stored, so it can never
   drift or explode after one event.
   ============================================================ */

/** Coarse task structure — what KIND of thing this is. */
export type Structure =
  | "prep"
  | "writing"
  | "research"
  | "communication"
  | "cleaning"
  | "deciding"
  | "learning"
  | "creating"
  | "errand"
  | "fixing"
  | "organizing"
  | "project"
  | "generic";

/** The ten initiation strategy categories. */
export type StrategyId =
  | "physical"
  | "info"
  | "decision"
  | "tiny"
  | "timebox"
  | "permission"
  | "visual"
  | "social"
  | "question"
  | "direct";

/** What is blocking the user right now. */
export type Barrier =
  | "overwhelmed"
  | "unclear"
  | "boring"
  | "perfectionism"
  | "anxiety"
  | "distracted"
  | "tired"
  | "avoiding"
  | "unknown";

/** Is the problem in the TASK (needs clarification/decomposition) or in STARTING (needs friction reduction)? */
export type BarrierKind = "task" | "starting" | "none";

/** Explicit lightweight feedback after an attempted step. */
export type FeedbackKind = "worked" | "tooBig" | "stuck" | "irrelevant";

export type Difficulty = "easy" | "abit" | "hard" | "impossible";

/** Legacy rescue-mode reasons (mapped onto barriers by the engine). */
export type StuckReason =
  | "unknown-next"
  | "too-big"
  | "distracted"
  | "tired"
  | "afraid"
  | "lost-interest"
  | "dont-want"
  | "dont-know";

export type EntryKind = "normal" | "ten" | "shrinker" | "overwhelm" | "onetap" | "statecheck" | "recover";

export type SessionKind = "focus" | "ten" | "micro";

export type Outcome = "kept" | "stopped" | "stuck";

export type ThemeId = "pine" | "dawn" | "rain";

/** How sure the profile is about its own conclusions. */
export type ConfidenceTier = "none" | "low" | "emerging" | "stable";

/* ---------------- task understanding ---------------- */

export interface TaskAnalysis {
  /** Normalized (trimmed, capped, de-quoted) task text. */
  title: string;
  structure: Structure;
  /** Base verb if a known one was found ("write"). */
  verb: string | null;
  /** Safe gerund/noun form for templates ("writing", "a reply"). */
  verbPhrase: string | null;
  /** The concrete object phrase ("the report", "my taxes"). */
  object: string;
  place: string | null;
  tool: string | null;
  person: string | null;
  /** 0..3 — how large/abstract the ask is. */
  complexity: number;
  /** 0..1 — how unclear the first move is from the wording alone. */
  ambiguity: number;
  /** 0..3 — estimated real-world effort. */
  effort: number;
  /** 0..3 — how many separate sub-actions the wording implies. */
  actionCount: number;
  /** 0..3 — how many prerequisites it seems to depend on. */
  dependencies: number;
  /** Involves moving the body / moving through space. */
  physical: boolean;
  /** Happens on a screen. */
  digital: boolean;
  /** Requires opening another application to even begin. */
  needsApp: boolean;
  /** The wording already contains an obvious first step. */
  clearFirstStep: boolean;
  /** 0..1 — likely emotional weight (fear, dread, stakes). */
  emotionalFriction: number;
  /** 0..1 — uncertainty about how or where to begin. */
  uncertainty: number;
  /** Count of classic avoidance triggers (big scope, vague, deadline, people). */
  avoidanceTriggers: number;
  /** The scope word that made it big ("entire", "all"…), if any. */
  scopeWord: string | null;
}

/* ---------------- capacity ---------------- */

/** The user's current ability to initiate — inferred, never judged. */
export interface Capacity {
  /** 0..1 — available initiation energy right now. */
  energy: number;
  /** Why the estimate landed where it did (internal metadata). */
  reason: string;
}

/* ---------------- candidates & scoring ---------------- */

/**
 * Normalized cost/benefit dimensions, each in [0, 1].
 * Every dimension exists for a behavioral reason:
 *  progress    — how much real task-state change this buys
 *  effort      — physical/time work required
 *  initiation  — activation energy to begin (open apps, find things)
 *  ambiguity   — unclear wording or unclear how-to
 *  cognitive   — decisions/thinking it demands
 *  emotional   — dread/stakes it touches
 *  dependencies— prerequisites that must hold first
 *  confidence  — engine's belief it can be executed as written
 */
export interface CostVector {
  progress: number;
  effort: number;
  initiation: number;
  ambiguity: number;
  cognitive: number;
  emotional: number;
  dependencies: number;
  confidence: number;
}

export interface CandidateAction {
  action: string;
  strategy: StrategyId;
  size: number;
  costs: CostVector;
  source: "template" | "decompose" | "fallback";
}

/** Concise, non-private decision metadata (safe for UI exposure). */
export interface DecisionMeta {
  /** One line: why this action, this size, this strategy. */
  reason: string;
  /** 0..1 engine confidence the user can execute this now. */
  confidence: number;
  expectedEffort: "tiny" | "small" | "medium";
  barrierKind: BarrierKind;
}

export interface EngineResult {
  action: string;
  strategy: StrategyId;
  size: number;
  note: string | null;
}

export type Decision = EngineResult & DecisionMeta;

export interface PreviewStep {
  action: string;
  strategy: StrategyId;
  size: number;
}

/* ---------------- engine runtime ---------------- */

interface SizeTrack {
  size: number;
  /** Consecutive positive outcomes at that size. */
  worked: number;
  /** Consecutive negative outcomes at that size. */
  failed: number;
}

/** Anti-repetition + adaptation memory for the current attempt chain. */
export interface EngineMemory {
  /** Normalized action texts already shown (capped). */
  shown: string[];
  /** Strategy ids already used (capped). */
  strategies: StrategyId[];
  /** Strategies that were followed by negative feedback. */
  failed: StrategyId[];
  /** Normalized actions followed by negative feedback, with counts. */
  failedActions: Array<{ k: string; n: number }>;
  /** Hysteresis for size adaptation (prevents oscillation). */
  sizeTrack: SizeTrack;
}

/* ---------------- persistence ---------------- */

export interface Rate {
  kept: number;
  total: number;
}

export interface Profile {
  starts: number;
  kept: number;
  /** Step size that most often led to momentum. */
  bestSize: number | null;
  /** Session length that most often led to momentum. */
  bestDuration: number | null;
  bestStrategy: StrategyId | null;
  commonBarrier: Barrier | null;
  /** Barriers seen ≥3 times — recurring patterns, not one-offs. */
  repeatedBarriers: Barrier[];
  /** Seconds between naming a task and starting it, when it worked. */
  avgTimeToStart: number | null;
  /** Momentum over the last few sessions. */
  momentum: "hot" | "warm" | "cold" | "none";
  /** Success rate of sessions that needed a rescue (0..1). */
  recoveryRate: number | null;
  /** Completion rates by size / structure / barrier (sample-guarded). */
  rates: {
    size: Record<string, Rate>;
    structure: Record<string, Rate>;
    barrier: Record<string, Rate>;
  } | null;
  confidence: ConfidenceTier;
}

export interface SessionRecord {
  id: string;
  title: string | null;
  structure: Structure;
  kind: SessionKind;
  startedAt: number;
  endedAt: number | null;
  seconds: number;
  steps: number;
  rescues: number;
  outcome: Outcome | null;
  /** Adaptive step size used (0..4). */
  size: number;
  /** Planned session length in seconds. */
  duration: number;
  entry: EntryKind;
  barrier: Barrier | null;
  strategy: StrategyId | null;
  /** Seconds from task entry to first start (null if unknown). */
  timeToStart: number | null;
}

export interface Draft {
  title: string;
  analysis: TaskAnalysis;
  /** Adaptive step size: 0 full … 4 the floor. */
  level: number;
  stepIndex: number;
  stepsDone: number;
  rescues: number;
  feedbacks: number;
  startedAt: number;
  enteredAt: number;
  sessionId: string | null;
  kind: SessionKind;
  /** The current single action (engine always keeps this set). */
  override: string | null;
  strategy: StrategyId | null;
  note: string | null;
  /** AI-provided ladder, if a remote engine was configured. */
  ladderOverride: string[] | null;
  entry: EntryKind;
  blocker: Barrier | null;
  lastFeedback: FeedbackKind | null;
  memory: EngineMemory;
  /** Latest decision metadata (internal; not required by screens). */
  decision?: DecisionMeta | null;
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
  | { id: "focus"; durationSec: number; bodyDouble: boolean }
  | { id: "rescue" }
  | { id: "reset"; returnTo: "focus" | "shrinker" | "onestep" }
  | { id: "recover" }
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
