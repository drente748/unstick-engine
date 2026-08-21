/* ============================================================
   Engine + app domain types.

   The engine is an explicit reasoning pipeline:
   normalize → classify → complexity → friction → barrier
   hypothesis → capacity → size → candidates → score →
   guardrails → dedupe → select → explain → learn → profile.

   CONTRACT RULES (enforced by these types, not by hope):
   · Level is a branded 0..4 union — invalid sizes are
     unrepresentable in Draft / Decision / PreviewStep / sessions.
   · Medium is a hard compatibility dimension — every template
     declares the media it is valid for, and every generator
     filters through that declaration.
   · EngineMemory carries the ONE canonical anti-repetition state
     (exact + intent fingerprints) used by every code path that
     can emit an action.
   ============================================================ */

/** Validated adaptive step size: 0 full … 4 the floor. */
export type Level = 0 | 1 | 2 | 3 | 4;

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

/**
 * Where the task happens. A HARD compatibility dimension:
 * templates and rungs declare which media they are valid for,
 * and generators must filter on it. "unknown" allows either, but
 * never licenses fabricating a location or an app.
 */
export type Medium = "digital" | "physical" | "mixed" | "unknown";

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

/* ---------------- analysis confidence & versions ---------------- */

/**
 * Deterministic confidence (0..1) for each inference the analysis
 * makes. Low confidence means "treat as a weak prior", never as fact.
 */
export interface AnalysisConfidence {
  structure: number;
  medium: number;
  verb: number;
  object: number;
  barrier: number;
}

/** Bump when analysis rules change meaningfully (recorded in traces). */
export const ANALYSIS_VERSION = "4.0.0-parse";

/* ---------------- semantic parse layer (analysis v4) ---------------- */

/** A single extracted value plus how strongly / explicitly it was evidenced. */
export interface SlotEvidence {
  value: string;
  /** 0..1 — how confident the parse is about this value. */
  strength: number;
  /** Stated in the text (true) vs inferred from structure (false). */
  explicit: boolean;
}

/**
 * The structured semantic parse of a task. This is the "new-generation"
 * core: instead of matching keyword bags, the analysis produces typed
 * slots with evidence, and every downstream estimate (structure, effort,
 * ambiguity, medium) is derived FROM these slots. Fully deterministic.
 */
export interface ParsedIntent {
  raw: string;
  /** Normalized display title. */
  title: string;
  action: {
    verb: string | null;
    phrase: string | null;
    /** Where the verb sits — earlier verbs are stronger initiation cues. */
    position: "initial" | "mid" | "late" | "none";
    strength: number;
  };
  target: { object: string; strength: number };
  /** Who the task is directed at ("reply to JOHN…"). */
  recipient: string | null;
  /** What the task is about ("…about THE INVOICE"). */
  topic: string | null;
  place: SlotEvidence | null;
  tool: SlotEvidence | null;
  deadline: { value: string | null; soon: boolean };
  scope: { word: string | null; strength: number };
  /** "don't X", "stop X", "quit X" — the task is framed as avoidance. */
  negated: boolean;
  /** before/after/once/when/so-that — prerequisite structure. */
  conditionals: number;
  /** and / , / ; / + — multi-part structure. */
  conjunctions: number;
  length: number;
  vague: boolean;
  /** Distinct evidence kinds found — drives confidence. */
  evidenceKinds: string[];
}

/** A scored structure hypothesis with margin-based confidence + evidence. */
export interface StructureScore {
  structure: Structure;
  score: number;
  /** 0..1 — margin over the runner-up, blended with evidence diversity. */
  confidence: number;
  /** Human-readable evidence strings (internal, explainable). */
  evidence: string[];
}
/** Bump when the ranking/scoring policy changes (recorded in traces). */
export const POLICY_VERSION = "heur-1.0.0";

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
  /** Decomposed parts of a multi-part task (e.g. "declutter the garage
   *  and sell old stuff online" → ["declutter the garage",
   *  "sell old stuff online"]). Empty for single-part tasks. Used to
   *  anchor the engine to the FIRST real move, never a fabricated one. */
  parts: string[];
  /** 0..3 — how many prerequisites it seems to depend on. */
  dependencies: number;
  /** Involves moving the body / moving through space. */
  physical: boolean;
  /** Happens on a screen. */
  digital: boolean;
  /** Derived hard compatibility class (see Medium). */
  medium: Medium;
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
  /** 0..3 — how broad the scope is (0 bounded … 3 whole-domain). */
  scopeStrength: number;
  /** Who the task is directed at ("reply to John…"), if stated. */
  recipient: string | null;
  /** What it's about ("…about the invoice"), if stated. */
  topic: string | null;
  /** A near deadline raises initiation friction without fabricating dates. */
  deadlineSoon: boolean;
  /** Framed as avoidance ("don't…", "stop…", "quit…"). */
  negated: boolean;
  /** Prerequisite markers (before/after/once/when…). */
  conditionals: number;
  /** Evidence backing the chosen structure (explainability). */
  structureEvidence: string[];
  /** Per-inference confidence values (0..1). */
  analysisConfidence: AnalysisConfidence;
  /** Analysis rules version that produced this object. */
  analysisVersion: string;
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
  size: Level;
  costs: CostVector;
  /** "remote" candidates are AI-provided; they earn nothing — they must
   *  pass the exact same local validation as everything else. */
  source: "template" | "decompose" | "fallback" | "remote";
}

/* ---------------- decision trace (internal, privacy-safe) ---------------- */

export interface CandidateTrace {
  action: string;
  strategy: StrategyId;
  size: Level;
  score: number;
  valid: boolean;
  source: CandidateAction["source"];
}

export interface DecisionTrace {
  policyVersion: string;
  analysisVersion: string;
  candidates: CandidateTrace[];
  chosenIndex: number;
  /**
   * The engine is deterministic: the top valid candidate is always
   * chosen. Never fabricate stochastic-looking numbers.
   */
  selectionProbability: 1;
  createdAt: number;
}

/* ---------------- ranker architecture ---------------- */

export interface RankingContext {
  analysis: TaskAnalysis;
  barrier: Barrier | null;
  size: Level;
  memory: EngineMemory;
  profile: Profile | null;
  salt: number;
  capacityEnergy?: number | null;
  avoidStrategy?: StrategyId | null;
}

export interface RankedCandidate {
  candidate: CandidateAction;
  score: number;
}

/**
 * Ranking is separable from generation/validation by design.
 * HeuristicRanker is the shipped baseline; LearnedRanker exists only
 * as a future contract — there is deliberately no online learning yet.
 */
export interface CandidateRanker {
  id: string;
  rank(context: RankingContext, candidates: CandidateAction[]): RankedCandidate[];
}

/**
 * Future policy abstraction (contextual bandit). Exploration is
 * disabled by default and may only ever explore locally-valid
 * candidates. Do not enable without explicit opt-in.
 */
export interface PolicySelector {
  select(
    context: RankingContext,
    candidates: CandidateAction[],
  ): { chosen: CandidateAction; probability: number; policyVersion: string };
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
  size: Level;
  note: string | null;
}

export type Decision = EngineResult & DecisionMeta;

export interface PreviewStep {
  action: string;
  strategy: StrategyId;
  size: Level;
}

/* ---------------- engine runtime ---------------- */

export interface SizeTrack {
  /** The size being tracked (null = no streak yet). */
  size: Level | null;
  /** Consecutive positive outcomes at that size. */
  worked: number;
  /** Consecutive negative outcomes at that size. */
  failed: number;
}

/**
 * Anti-repetition + adaptation memory for the current attempt chain.
 * This is the ONE canonical dedupe state: every code path that can
 * emit an action records it here under both its exact fingerprint
 * (shown) and its intent fingerprint (shownIntents).
 */
export interface EngineMemory {
  /** Exact-normalized action texts already shown (capped). */
  shown: string[];
  /** Intent fingerprints already shown — catches wording variants. */
  shownIntents: string[];
  /** Strategy ids already used (capped). */
  strategies: StrategyId[];
  /** Strategies that were followed by negative feedback. */
  failed: StrategyId[];
  /** Exact-normalized actions followed by negative feedback, with counts. */
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
  bestSize: Level | null;
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
  /** Adaptive step size used. */
  size: Level;
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
  /** Adaptive step size — always a valid Level. */
  level: Level;
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
  /**
   * Local profile learning from your own sessions. On by default
   * (baseline behavior); can be disabled completely — the engine then
   * treats every session as a fresh start. Never sent anywhere.
   */
  learningEnabled: boolean;
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
