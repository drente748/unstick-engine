import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  Barrier,
  Difficulty,
  Draft,
  EntryKind,
  FeedbackKind,
  Outcome,
  Profile,
  Screen,
  SessionKind,
  SessionRecord,
  Settings,
  StuckReason,
} from "../engine/types";
import { clampLevel } from "../engine/analysis";
import {
  adaptFromFeedback,
  advanceStep,
  analyzeTask,
  barrierIntervention,
  buildRecoveryStrategy,
  computeProfile,
  emptyMemory,
  emptyProfile,
  planFirstStep,
  reasonToBarrier,
  rescueIntervention,
  tryRemoteEngine,
  runEngineSelfTest,
} from "../engine/localEngine";
import { DEFAULT_SETTINGS, clearPersisted, loadPersisted, savePersisted, uid } from "../lib/persist";

if (import.meta.env.DEV) runEngineSelfTest();

export interface State {
  screen: Screen;
  draft: Draft | null;
  sessions: SessionRecord[];
  settings: Settings;
  paused: boolean;
  pausedAt: number | null;
  toast: { id: number; msg: string } | null;
}

export type Action =
  | { type: "nav"; screen: Screen }
  | { type: "enterTask"; title: string; entry: EntryKind; ladderOverride?: string[] | null }
  | { type: "difficulty"; value: Difficulty }
  | { type: "answerBlocker"; blocker: Barrier }
  | { type: "setLevel"; level: number }
  | { type: "resize"; delta: number }
  | { type: "start"; durationSec: number; bodyDouble: boolean; kind?: SessionKind }
  | { type: "next" }
  | { type: "rescued" }
  | { type: "applyRescue"; reason: StuckReason }
  | { type: "feedback"; kind: FeedbackKind }
  | { type: "endSession" }
  | { type: "answer"; outcome: Outcome }
  | { type: "restartSmaller" }
  | { type: "recover" }
  | { type: "clearPending" }
  | { type: "pause"; value: boolean }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "clearData" }
  | { type: "toast"; msg: string }
  | { type: "untoast" };

function makeDraft(title: string, entry: EntryKind, ladderOverride: string[] | null): Draft {
  const analysis = analyzeTask(title);
  return {
    title: analysis.title,
    analysis,
    level: 0,
    stepIndex: 0,
    stepsDone: 0,
    rescues: 0,
    feedbacks: 0,
    startedAt: 0,
    enteredAt: Date.now(),
    sessionId: null,
    kind: "focus",
    override: null,
    strategy: null,
    note: null,
    ladderOverride,
    entry,
    blocker: null,
    lastFeedback: null,
    memory: emptyMemory(),
  };
}

function patchSession(sessions: SessionRecord[], id: string | null, patch: Partial<SessionRecord>) {
  if (!id) return sessions;
  return sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Non-negative integer from untyped persisted JSON — never NaN, never undefined. */
function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Rebuild a Draft from untyped persisted JSON.
 * Persistence is a trust boundary: whatever shape an older engine
 * version (or corrupted storage) left behind, the rebuilt Draft is
 * guaranteed valid — analysis and memory are always regenerated,
 * every numeric field is sanitized, and level is clamped to a real
 * Level. Invalid state can never cross into the reducer.
 */
function migrateDraft(d: unknown): Draft | null {
  if (!d || typeof d !== "object") return null;
  const raw = d as Partial<Draft> & Record<string, unknown>;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;

  const fresh = makeDraft(raw.title, (raw.entry as Draft["entry"]) ?? "normal", (raw.ladderOverride as string[] | null) ?? null);
  const validEntries: Draft["entry"][] = ["normal", "ten", "shrinker", "overwhelm", "onetap", "statecheck", "recover"];
  const validKinds: Draft["kind"][] = ["focus", "ten", "micro"];

  return {
    title: fresh.title,
    analysis: fresh.analysis,
    level: clampLevel(Number(raw.level)),
    stepIndex: safeInt(raw.stepIndex),
    stepsDone: safeInt(raw.stepsDone),
    rescues: safeInt(raw.rescues),
    feedbacks: safeInt(raw.feedbacks),
    startedAt: safeInt(raw.startedAt),
    enteredAt: safeInt(raw.enteredAt) || Date.now(),
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : null,
    kind: validKinds.includes(raw.kind as Draft["kind"]) ? (raw.kind as Draft["kind"]) : "focus",
    override: typeof raw.override === "string" ? raw.override : null,
    strategy: (raw.strategy as Draft["strategy"]) ?? null,
    note: typeof raw.note === "string" ? raw.note : null,
    ladderOverride: Array.isArray(raw.ladderOverride)
      ? (raw.ladderOverride as unknown[]).filter((x): x is string => typeof x === "string")
      : null,
    entry: validEntries.includes(raw.entry as Draft["entry"]) ? (raw.entry as Draft["entry"]) : "normal",
    blocker: (raw.blocker as Draft["blocker"]) ?? null,
    lastFeedback: (raw.lastFeedback as Draft["lastFeedback"]) ?? null,
    memory: fresh.memory,
  };
}

function reducer(state: State, a: Action): State {
  const profile = computeProfile(state.sessions);

  switch (a.type) {
    case "nav":
      return { ...state, screen: a.screen, paused: false, pausedAt: null };

    case "enterTask": {
      const title = a.title.trim().slice(0, 120);
      if (!title) return state;
      const draft = makeDraft(title, a.entry, a.ladderOverride ?? null);

      if (a.entry === "onetap" || a.entry === "statecheck" || a.entry === "shrinker" || a.entry === "overwhelm") {
        const plan = planFirstStep(draft.analysis, {
          profile,
          extraShrink: a.entry === "overwhelm" ? 1 : 0,
        });
        const withPlan: Draft = {
          ...draft,
          level: plan.size,
          override: plan.action,
          strategy: plan.strategy,
          note: "engine-picked start",
          memory: plan.memory,
        };
        if (a.entry === "onetap") return { ...state, draft: withPlan, screen: { id: "onestep" } };
        if (a.entry === "statecheck") return { ...state, draft: withPlan, screen: { id: "statecheck" } };
        if (a.entry === "shrinker") return { ...state, draft: withPlan, screen: { id: "shrinker" } };
        return { ...state, draft: withPlan, screen: { id: "overwhelm" } };
      }

      return {
        ...state,
        draft,
        screen: a.entry === "normal" ? { id: "threshold", task: title } : { id: "home" },
      };
    }

    case "difficulty": {
      if (!state.draft) return state;
      if (a.value === "easy") {
        const plan = planFirstStep(state.draft.analysis, { profile, durationSec: 10 });
        const draft: Draft = {
          ...state.draft,
          level: plan.size,
          override: plan.action,
          strategy: plan.strategy,
          memory: plan.memory,
          note: "easy day — go straight in",
        };
        return { ...state, draft, screen: { id: "quick" } };
      }
      if (a.value === "impossible") {
        const plan = planFirstStep(state.draft.analysis, { profile, extraShrink: 2, durationSec: 10 });
        const draft: Draft = {
          ...state.draft,
          level: plan.size,
          override: plan.action,
          strategy: plan.strategy,
          memory: plan.memory,
          note: "micro start",
        };
        return { ...state, draft, screen: { id: "micro" } };
      }
      const plan = planFirstStep(state.draft.analysis, {
        profile,
        extraShrink: a.value === "hard" ? 1 : 0,
      });
      const draft: Draft = {
        ...state.draft,
        level: plan.size,
        override: plan.action,
        strategy: plan.strategy,
        memory: plan.memory,
      };
      return { ...state, draft, screen: { id: "shrinker" } };
    }

    case "answerBlocker": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      const draft0: Draft = { ...state.draft, blocker: a.blocker, entry: "statecheck" };
      const iv = barrierIntervention(draft0, a.blocker, profile);
      if (iv.reset) {
        return {
          ...state,
          draft: draft0,
          screen: { id: "reset", returnTo: draft0.startedAt > 0 ? "focus" : "onestep" },
        };
      }
      const draft: Draft = {
        ...draft0,
        override: iv.action,
        level: iv.size,
        strategy: iv.strategy,
        note: iv.headline,
        memory: iv.memory,
      };
      return { ...state, draft, screen: { id: "onestep" } };
    }

    case "setLevel": {
      if (!state.draft) return state;
      const level = clampLevel(a.level);
      const res = advanceStep({ ...state.draft, level }, profile);
      return {
        ...state,
        draft: {
          ...state.draft,
          level,
          override: res.override,
          strategy: res.strategy,
          memory: res.memory,
          stepsDone: state.draft.stepsDone,
          note: res.decision.reason ?? state.draft.note,
        },
      };
    }

    case "resize": {
      if (!state.draft) return state;
      const level = clampLevel(state.draft.level + a.delta);
      const base: Draft = { ...state.draft, level, lastFeedback: a.delta > 0 ? "tooBig" : "worked" };
      const res = adaptFromFeedback(base, profile, a.delta > 0 ? "tooBig" : "worked");
      return {
        ...state,
        draft: {
          ...state.draft,
          level: res.level,
          override: res.override,
          strategy: res.strategy,
          memory: res.memory,
          feedbacks: res.feedbacks,
          lastFeedback: res.lastFeedback,
          note: res.note,
        },
      };
    }

    case "start": {
      if (!state.draft) return state;
      const id = uid();
      const kind: SessionKind = a.kind ?? "focus";
      const timeToStart =
        state.draft.enteredAt > 0 ? Math.max(0, Math.round((Date.now() - state.draft.enteredAt) / 1000)) : null;
      const record: SessionRecord = {
        id,
        title: state.settings.saveTitles ? state.draft.title : null,
        structure: state.draft.analysis.structure,
        kind,
        startedAt: Date.now(),
        endedAt: null,
        seconds: 0,
        steps: 0,
        rescues: state.draft.rescues,
        outcome: null,
        size: state.draft.level,
        duration: a.durationSec,
        entry: state.draft.entry,
        barrier: state.draft.blocker,
        strategy: state.draft.strategy,
        timeToStart,
      };
      return {
        ...state,
        sessions: [...state.sessions, record],
        draft: { ...state.draft, startedAt: Date.now(), sessionId: id, kind },
        screen: { id: "focus", durationSec: a.durationSec, bodyDouble: a.bodyDouble },
        paused: false,
        pausedAt: null,
      };
    }

    case "next": {
      if (!state.draft) return state;
      const res = advanceStep(state.draft, profile);
      const sessions = state.sessions.map((s) =>
        s.id === state.draft?.sessionId ? { ...s, steps: s.steps + 1 } : s,
      );
      return {
        ...state,
        sessions,
        draft: {
          ...state.draft,
          stepsDone: res.stepsDone,
          stepIndex: state.draft.stepIndex + 1,
          override: res.override,
          strategy: res.strategy,
          level: res.level,
          memory: res.memory,
          lastFeedback: "worked",
        },
      };
    }

    case "rescued": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: { ...state.draft, rescues: state.draft.rescues + 1 },
        sessions: patchSession(state.sessions, state.draft.sessionId, {
          rescues: state.draft.rescues + 1,
        }),
      };
    }

    case "applyRescue": {
      if (!state.draft) return state;
      const barrier = reasonToBarrier(a.reason);
      const draft0: Draft = { ...state.draft, blocker: barrier, rescues: state.draft.rescues };
      const iv = rescueIntervention(draft0, a.reason, profile);
      if (iv.reset) return state; /* handled by the screen before dispatch */
      return {
        ...state,
        draft: {
          ...draft0,
          override: iv.action,
          level: iv.size,
          strategy: iv.strategy,
          note: iv.headline,
          memory: iv.memory,
        },
      };
    }

    case "feedback": {
      if (!state.draft) return state;
      const res = adaptFromFeedback(state.draft, profile, a.kind);
      const sessions =
        a.kind === "worked"
          ? state.sessions.map((s) => (s.id === state.draft?.sessionId ? { ...s, steps: s.steps + 1 } : s))
          : state.sessions;
      return {
        ...state,
        sessions,
        draft: {
          ...state.draft,
          override: res.override,
          level: res.level,
          strategy: res.strategy,
          memory: res.memory,
          feedbacks: res.feedbacks,
          lastFeedback: res.lastFeedback,
          note: res.note,
        },
      };
    }

    case "endSession": {
      if (!state.draft || !state.draft.sessionId) return { ...state, screen: { id: "home" } };
      const id = state.draft.sessionId;
      const started = state.draft.startedAt;
      return {
        ...state,
        sessions: patchSession(state.sessions, id, {
          endedAt: Date.now(),
          seconds: started ? Math.round((Date.now() - started) / 1000) : 0,
        }),
        paused: false,
        pausedAt: null,
        screen: { id: "complete" },
      };
    }

    case "answer": {
      if (!state.draft) return state;
      const sessions = patchSession(state.sessions, state.draft.sessionId, { outcome: a.outcome });
      if (a.outcome === "stuck") {
        return { ...state, sessions, screen: { id: "rescue" } };
      }
      return { ...state, sessions };
    }

    case "restartSmaller": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      const base: Draft = { ...state.draft, entry: "recover" };
      const res = buildRecoveryStrategy(base, profile, "tooBig");
      return {
        ...state,
        draft: {
          ...state.draft,
          level: res.level,
          override: res.override,
          strategy: res.strategy,
          memory: res.memory,
          feedbacks: res.feedbacks,
          lastFeedback: res.lastFeedback,
          note: res.note,
          entry: "recover",
        },
        screen: { id: "shrinker" },
      };
    }

    case "recover": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      const res = buildRecoveryStrategy(state.draft, profile, "drifted");
      return {
        ...state,
        draft: {
          ...state.draft,
          level: res.level,
          override: res.override,
          strategy: res.strategy,
          memory: res.memory,
          feedbacks: res.feedbacks,
          lastFeedback: res.lastFeedback,
          note: res.note,
          entry: "recover",
        },
        screen: { id: "recover" },
      };
    }

    case "clearPending":
      return { ...state, draft: null, screen: { id: "home" }, paused: false, pausedAt: null };

    case "pause":
      return { ...state, paused: a.value, pausedAt: a.value ? Date.now() : null };

    case "settings":
      return { ...state, settings: { ...state.settings, ...a.patch } };

    case "clearData":
      return {
        ...state,
        sessions: [],
        draft: null,
        screen: { id: "home" },
      };

    case "toast":
      return { ...state, toast: { id: Date.now(), msg: a.msg } };

    case "untoast":
      return { ...state, toast: null };

    default:
      return state;
  }
}

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
  submitTask: (title: string, entry: EntryKind) => Promise<void>;
  profile: Profile;
}

const AppCtx = createContext<Ctx | null>(null);

function initState(): State {
  const saved = loadPersisted();
  const overdue =
    saved.pending && saved.pending.startedAt > 0 && Date.now() - saved.pending.startedAt > 45 * 60 * 1000;
  return {
    screen: { id: "home" },
    draft: overdue ? null : migrateDraft(saved.pending),
    sessions: saved.sessions,
    settings: saved.settings,
    paused: false,
    pausedAt: null,
    toast: null,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  /* local-first persistence */
  useEffect(() => {
    savePersisted({
      v: 1,
      sessions: state.sessions,
      pending: state.draft,
      settings: state.settings,
      lastVisit: Date.now(),
    });
  }, [state.sessions, state.draft, state.settings]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${(state.settings.textScale / 100) * 16}px`;
  }, [state.settings.textScale]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", state.settings.reduceMotion);
  }, [state.settings.reduceMotion]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "untoast" }), 3600);
    return () => clearTimeout(t);
  }, [state.toast]);

  const endpoint = state.settings.aiEndpoint.trim();
  const submitTask = useCallback(
    async (title: string, entry: EntryKind) => {
      let ladder: string[] | null = null;
      if (endpoint && entry === "normal") {
        ladder = await tryRemoteEngine(endpoint, title);
        if (!ladder) dispatch({ type: "toast", msg: "AI is taking a break — the built-in engine has you." });
      }
      dispatch({ type: "enterTask", title, entry, ladderOverride: ladder });
    },
    [endpoint],
  );

  /* Learning is opt-out: when disabled, the engine gets an empty profile
     and treats every session as a fresh start. Baseline behavior stays. */
  const profile = useMemo(
    () => (state.settings.learningEnabled ? computeProfile(state.sessions) : emptyProfile(state.sessions.length)),
    [state.sessions, state.settings.learningEnabled],
  );

  return <AppCtx.Provider value={{ state, dispatch, submitTask, profile }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function clearLocalData() {
  clearPersisted();
}

export type { Settings };
