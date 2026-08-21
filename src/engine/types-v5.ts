import type { Level, StrategyId, TaskAnalysis } from "./types";

/* ============================================================
   types-v5 — the semantic layer (Phase 0 of the v5 engine).

   Core principle (the project constitution):
     NEVER GENERATE FROM EXTRACTED WORDS.
     GENERATE FROM SEMANTIC RELATIONS.

   Everything here is:
     - English-only (the tool supports English exclusively)
     - deterministic (same input -> same output, no randomness)
     - local (no network, no cloud, no external model calls)
     - evidence-backed (every inference records WHY it was made)

   The v5 pipeline:
     Input -> NLU -> TaskGraph -> Evidence -> Beliefs
           -> Candidate Generation -> Validation cascade
           -> Ranking -> Critic -> Output -> Feedback -> Belief update
   ============================================================ */

/* ---------------- sub-intents (fine-grained intent) ---------------- */

/**
 * Fine-grained intent. Coarse structures ("communication", "errand")
 * are too wide — the FIRST move differs radically between a reply,
 * a follow-up, and a cancellation. SubIntent is the unit the
 * generator reasons about; Structure remains for coarse sizing.
 */
export type SubIntent =
  /* communication */
  | "reply" | "initiate-contact" | "follow-up" | "cancel-plan" | "negotiate"
  /* creation */
  | "draft-new" | "revise-existing" | "design-artifact"
  /* learning */
  | "study-material" | "practice-skill"
  /* research / decision */
  | "gather-options" | "compare-options" | "make-decision"
  /* admin / errand */
  | "submit-form" | "schedule-appointment" | "pay-bill" | "buy-item" | "file-organize"
  /* physical */
  | "clean-space" | "tidy-space" | "physical-activity"
  /* tech */
  | "fix-broken" | "build-project" | "configure-tool"
  /* meta */
  | "clarify-task" | "start-unknown";

/* ---------------- entities (normalized, role-tagged) ---------------- */

/** The semantic role an entity plays in the task graph. */
export type EntityRole =
  | "target"      /* the artifact acted upon: email, essay, kitchen */
  | "recipient"   /* who the action is directed at */
  | "topic"       /* what the action is about */
  | "place"       /* where it happens */
  | "tool"        /* the app/instrument used */
  | "person"      /* a named or relational person (mom, boss, Alex) */
  | "time";       /* a stated time/deadline */

/* ---------------- entity nature (semantic type) ---------------- */

/**
 * The SEMANTIC NATURE of an entity — what kind of thing it is and
 * therefore which actions are physically/semantically valid on it.
 * This is what prevents "Sit down at the room": sitting requires a
 * work-surface; a cleanable-space takes clean/tidy/pick-up verbs.
 */
export type EntityType =
  /* spaces you act INSIDE of, cleaning targets */
  | "cleanable-space"     /* room, kitchen, garage, apartment */
  | "work-surface"        /* desk, table, counter */
  | "storage-space"       /* closet, drawer, folder, drive */
  /* communication artifacts */
  | "communication-artifact" /* email, message, text, letter */
  | "person-contact"      /* Sarah, John, boss — a party to contact */
  /* documents & media */
  | "document"            /* essay, report, form, thesis */
  | "reading-material"    /* book, chapter, article, textbook */
  /* digital systems */
  | "digital-system"      /* website, app, codebase, portal */
  | "abstract-project"    /* project, business, launch, campaign */
  /* physical objects */
  | "physical-object"     /* tools, dishes, clothes, boxes */
  | "wearable"            /* clothes, shoes, gear */
  /* time & misc */
  | "temporal-reference"  /* Friday, next Tuesday */
  | "location-venue"      /* gym, store, bank — places you GO TO */
  | "unclassified";

/** Maps each EntityType to the action families that are VALID on it. */
export const ENTITY_ACTION_FIT: Record<EntityType, string[]> = {
  "cleanable-space": ["clean", "tidy", "enter", "approach", "survey"],
  "work-surface": ["clear", "sit-at", "arrange", "wipe"],
  "storage-space": ["organize", "sort", "open", "declutter"],
  "communication-artifact": ["open", "read", "reply", "draft", "send"],
  "person-contact": ["contact", "message", "call", "ask"],
  document: ["write", "edit", "open", "print", "review"],
  "reading-material": ["read", "skim", "open", "annotate"],
  "digital-system": ["open", "fix", "configure", "inspect"],
  "abstract-project": ["start", "plan", "advance", "survey"],
  "physical-object": ["pick-up", "move", "gather", "wash"],
  wearable: ["lay-out", "gather", "put-on"],
  "temporal-reference": [],
  "location-venue": ["go-to", "travel-to", "pack-for"],
  unclassified: [],
};

export interface TaskEntity {
  /** Stable id inside one graph (e.g. "e1"). */
  id: string;
  role: EntityRole;
  /** Display text, original casing preserved. */
  text: string;
  /** Lowercased normalized key for matching/dedupe (never displayed). */
  key: string;
  /** 0..1 — parse confidence in this entity. */
  confidence: number;
  /** How it was found — always recorded, never guessed silently. */
  evidence: string;
  /** Which clause (0-based) this entity came from. Head clause = 0. */
  clause?: number;
  /** Semantic nature — set by the reason layer, not the parse. */
  entityType?: EntityType;
}

/* ---------------- the task graph (nodes + typed relation edges) ---------------- */

/**
 * A typed edge between two entities. This is what makes generation
 * relation-safe: a candidate may only reference entities through
 * their edges, never as a flat word bag.
 */
export type RelationKind =
  | "acted-on"     /* verb -> target */
  | "directed-to"  /* verb -> recipient */
  | "about"        /* verb -> topic */
  | "located-at"   /* target -> place */
  | "via"          /* verb/target -> tool */
  | "owned-by"     /* target -> person */
  | "due-by"       /* verb -> time */
  | "part-of";     /* target -> larger whole */

export interface RelationEdge {
  from: string; /* entity id */
  kind: RelationKind;
  to: string;   /* entity id */
  /** 0..1 — how certain this relation is. */
  confidence: number;
  evidence: string;
}

/**
 * The immutable semantic representation of ONE task. Built once at
 * entry, never mutated by beliefs or learning (the agent may add
 * beliefs ABOUT the graph, but never rewrite the graph itself).
 */
export interface TaskGraph {
  /** The verb heading the graph ("reply", "clean", "study"...). */
  action: string | null;
  /** Fine-grained intent — the unit of generation. */
  subIntent: SubIntent;
  /** Coarse structure, aligned with the existing v4 analysis. */
  structure: TaskAnalysis["structure"];
  /** All entities, keyed by id. */
  entities: TaskEntity[];
  /** Typed relation edges between entities. */
  relations: RelationEdge[];
  /** Convenience: the entity with role "target", if any. */
  primaryTarget: TaskEntity | null;
  /** Convenience: the entity with role "recipient", if any. */
  recipient: TaskEntity | null;
  /** Convenience: the entity with role "topic", if any. */
  topic: TaskEntity | null;
  /** Multi-part clauses (each analyzed on its own). */
  clauses: string[];
  /** Verbs of secondary clauses, in order ("organize" in clause 2). */
  secondaryVerbs: string[];
  /** Parse confidence for the whole graph (0..1). */
  confidence: number;
  /** Every signal used, for debugging and eval. */
  evidence: string[];
}

/* ---------------- beliefs (evidence-backed hypotheses) ---------------- */

/**
 * A belief is a HYPOTHESIS about the user/task state, always with
 * its evidence. Beliefs never mutate the TaskGraph — they only
 * inform policy. Immutable original graph, mutable belief set.
 */
export interface Belief {
  kind:
    | "barrier"          /* why the user is stuck */
    | "capacity"         /* how much initiation energy exists now */
    | "fidelity-risk"    /* risk that a step type will drift off-task */
    | "momentum";        /* current momentum state */
  value: string;
  /** 0..1 */
  confidence: number;
  /** The observations that produced this belief. */
  evidence: string[];
}

/* ---------------- candidates & validation verdicts ---------------- */

/**
 * How faithfully a candidate serves the ORIGINAL task. Three grades
 * (not one): task-faithful steps act on the task itself;
 * entry-legitimate steps are legitimate ADHD doorway moves (body
 * activation, environment setup) allowed ONLY under the conditions
 * recorded in `entryRules`; off-task candidates are always rejected.
 */
export type FidelityGrade = "task-faithful" | "entry-legitimate" | "off-task";

/** Conditions under which an entry-legitimate step is allowed. */
export interface EntryRules {
  /** Barrier kind must be "starting" (not a task-comprehension problem). */
  requiresStartingBarrier: boolean;
  /** Must be the first step of the attempt (not mid-ladder filler). */
  onlyAsOpeningStep: boolean;
  /** May not appear twice in a row as the sole move. */
  notConsecutively: boolean;
}

/** The five dedupe keys — repetition is blocked at every level. */
export interface DedupeKeys {
  /** Exact normalized surface text. */
  surfaceKey: string;
  /** Canonical intent fingerprint (existing intentKey, kept). */
  intentKey: string;
  /** Sorted entity keys — same entities = same move family. */
  entityKey: string;
  /** Strategy id. */
  strategyKey: string;
  /** SubIntent + relation shape — the deepest semantic key. */
  semanticFrameKey: string;
}

/** A proposed step before validation. */
export interface CandidateV5 {
  action: string;
  strategy: StrategyId;
  size: Level;
  subIntent: SubIntent;
  /** Entity ids this candidate actually touches (must exist in graph). */
  touches: string[];
  /** Which relation kinds the candidate preserves. */
  preserves: RelationKind[];
  fidelity: FidelityGrade;
  entryRules: EntryRules;
  keys: DedupeKeys;
  source: "compose" | "archetype" | "fallback";
}

/** A validation verdict — REJECT, not low score. */
export interface Verdict {
  ok: boolean;
  /** Which gate rejected, for debugging and eval. */
  gate:
    | "structural"
    | "semantic"
    | "entity-consistency"
    | "executability"
    | "fidelity"
    | "dedupe"
    | "critic"
    | null;
  reason: string;
}

/* ---------------- archetype (case-based reasoning) ---------------- */

/**
 * A recurring task pattern with a playbook. New tasks match their
 * nearest archetype by weighted feature similarity, then the
 * playbook is ADAPTED to the specific graph — never copied blindly.
 */
export interface Archetype {
  id: string;
  /** Human-readable name (English). */
  name: string;
  /** Which SubIntents this archetype covers. */
  subIntents: SubIntent[];
  /** Feature keys that raise the match score. */
  features: string[];
  /** Playbook: ordered opening moves, each tied to graph roles. */
  playbook: Array<{
    /** Which role this move acts through (must resolve in the graph). */
    via: EntityRole;
    /** Move template using role placeholders, e.g. "Open {target}." */
    template: string;
    size: Level;
  }>;
}

/* ---------------- pipeline context ---------------- */

/** Everything the v5 pipeline carries from stage to stage. */
export interface PipelineContext {
  /** The original raw input — immutable. */
  raw: string;
  analysis: TaskAnalysis;
  graph: TaskGraph;
  beliefs: Belief[];
  /** Salt for deterministic variety (hash-derived, not random). */
  salt: number;
}
