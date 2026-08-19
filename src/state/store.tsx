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
  Blocker,
  Difficulty,
  Draft,
  EntryKind,
  Outcome,
  Profile,
  Screen,
  SessionKind,
  SessionRecord,
  Settings,
  StuckReason,
} from "../engine/types";
import {
  blockerIntervention,
  computeProfile,
  detectDomain,
  planFirstStep,
  tryRemoteEngine,
} from "../engine/localEngine";
import { DEFAULT_SETTINGS, clearPersisted, loadPersisted, savePersisted, uid } from "../lib/persist";

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
  | { type: "enterTask"; title: string; entry: EntryKind; level?: number; ladderOverride?: string[] | null }
  | { type: "difficulty"; value: Difficulty }
  | { type: "answerBlocker"; blocker: Blocker }
  | { type: "setLevel"; level: number }
  | { type: "resize"; delta: number }
  | { type: "start"; durationSec: number; bodyDouble: boolean; kind?: SessionKind }
  | { type: "next" }
  | { type: "rescued" }
  | { type: "applyRescue"; reason: StuckReason; action?: string; level?: number }
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
  return {
    title: title.trim(),
    domain: detectDomain(title),
    level: 0,
    stepIndex: 0,
    stepsDone: 0,
    rescues: 0,
    startedAt: 0,
    sessionId: null,
    kind: "focus",
    override: null,
    ladderOverride,
    entry,
    blocker: null,
    lastStrategy: null,
    note: null,
  };
}

function patchSession(sessions: SessionRecord[], id: string | null, patch: Partial<SessionRecord>) {
  if (!id) return sessions;
  return sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "nav":
      return { ...state, screen: a.screen, paused: false, pausedAt: null };

    case "enterTask": {
      const title = a.title.trim().slice(0, 120);
      if (!title) return state;
      const draft = makeDraft(title, a.entry, a.ladderOverride ?? null);
      const profile = computeProfile(state.sessions);

      if (a.entry === "onetap" || a.entry === "statecheck" || a.entry === "shrinker" || a.entry === "overwhelm") {
        const plan = planFirstStep({ title, domain: draft.domain, profile });
        if (a.entry === "onetap") {
          return {
            ...state,
            draft: { ...draft, level: plan.level, override: plan.action, note: plan.note },
            screen: { id: "onestep" },
          };
        }
        if (a.entry === "statecheck") {
          return { ...state, draft: { ...draft, level: plan.level, note: plan.note }, screen: { id: "statecheck" } };
        }
        if (a.entry === "shrinker") {
          return {
            ...state,
            draft: { ...draft, level: a.level ?? plan.level, note: plan.note },
            screen: { id: "shrinker" },
          };
        }
        /* overwhelm — start one notch smaller than the plan suggests */
        return {
          ...state,
          draft: { ...draft, level: a.level ?? Math.min(4, plan.level + 1) },
          screen: { id: "overwhelm" },
        };
      }

      return {
        ...state,
        draft,
        screen: a.entry === "normal" ? { id: "threshold", task: title } : { id: "home" },
      };
    }

    case "difficulty": {
      if (!state.draft) return state;
      if (a.value === "easy") return { ...state, screen: { id: "quick" } };
      if (a.value === "impossible") {
        return { ...state, draft: { ...state.draft, level: 3 }, screen: { id: "micro" } };
      }
      /* adaptive: nudge toward the step size that has produced momentum before */
      const profile = computeProfile(state.sessions);
      const base = a.value === "abit" ? 1 : 2;
      let level =
        profile.bestLevel != null && profile.confidence !== "none" ? Math.max(base, profile.bestLevel) : base;
      if (a.value === "abit") level = Math.min(level, 3);
      return { ...state, draft: { ...state.draft, level }, screen: { id: "shrinker" } };
    }

    case "answerBlocker": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      const iv = blockerIntervention(state.draft.domain, a.blocker, state.draft.level);
      const draft: Draft = { ...state.draft, blocker: a.blocker, entry: "statecheck" };
      if (iv.reset) {
        return {
          ...state,
          draft,
          screen: { id: "reset", returnTo: draft.startedAt > 0 ? "focus" : "onestep" },
        };
      }
      return {
        ...state,
        draft: {
          ...draft,
          override: iv.action,
          level: Math.min(4, draft.level + iv.levelShift),
          note: iv.headline,
        },
        screen: { id: "onestep" },
      };
    }

    case "setLevel": {
      if (!state.draft) return state;
      const level = Math.max(0, Math.min(4, a.level));
      return { ...state, draft: { ...state.draft, level } };
    }

    case "resize": {
      if (!state.draft) return state;
      const level = Math.max(0, Math.min(4, state.draft.level + a.delta));
      return { ...state, draft: { ...state.draft, level, override: null, note: null } };
    }

    case "start": {
      if (!state.draft) return state;
      const id = uid();
      const kind: SessionKind = a.kind ?? "focus";
      const record: SessionRecord = {
        id,
        title: state.settings.saveTitles ? state.draft.title : null,
        domain: state.draft.domain,
        kind,
        startedAt: Date.now(),
        endedAt: null,
        seconds: 0,
        steps: 0,
        rescues: state.draft.rescues,
        outcome: null,
        level: state.draft.level,
        duration: a.durationSec,
        entry: state.draft.entry,
        blocker: state.draft.blocker,
        strategy: state.draft.lastStrategy,
      };
      return {
        ...state,
        sessions: [...state.sessions, record],
        draft: { ...state.draft, startedAt: Date.now(), sessionId: id, kind, override: null },
        screen: { id: "focus", durationSec: a.durationSec, bodyDouble: a.bodyDouble },
        paused: false,
        pausedAt: null,
      };
    }

    case "next": {
      if (!state.draft) return state;
      const sessions = patchSession(state.sessions, state.draft.sessionId, {});
      const patched = sessions.map((s) => (s.id === state.draft?.sessionId ? { ...s, steps: s.steps + 1 } : s));
      return {
        ...state,
        sessions: patched,
        draft: { ...state.draft, stepsDone: state.draft.stepsDone + 1, stepIndex: state.draft.stepIndex + 1, override: null },
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
      const level = a.level !== undefined ? Math.max(0, Math.min(4, a.level)) : state.draft.level;
      return {
        ...state,
        draft: { ...state.draft, level, override: a.action ?? null, lastStrategy: a.reason, note: null },
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
      const draft: Draft = { ...state.draft };
      let sessions = state.sessions;
      if (draft.sessionId) {
        sessions = patchSession(state.sessions, draft.sessionId, { outcome: a.outcome });
      }
      if (a.outcome === "stuck") {
        return { ...state, sessions, screen: { id: "rescue" } };
      }
      return { ...state, sessions, draft };
    }

    case "restartSmaller": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      return {
        ...state,
        draft: {
          ...state.draft,
          level: Math.min(4, state.draft.level + 1),
          override: null,
          note: null,
          entry: "recover",
        },
        screen: { id: "shrinker" },
      };
    }

    case "recover": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      return {
        ...state,
        draft: {
          ...state.draft,
          level: Math.min(4, state.draft.level + 1),
          override: null,
          note: null,
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
  submitTask: (title: string, entry: EntryKind, level?: number) => Promise<void>;
  profile: Profile;
}

const AppCtx = createContext<Ctx | null>(null);

function initState(): State {
  const saved = loadPersisted();
  const overdue =
    saved.pending && saved.pending.startedAt > 0 && Date.now() - saved.pending.startedAt > 45 * 60 * 1000;
  return {
    screen: { id: "home" },
    draft: overdue ? null : saved.pending,
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
    async (title: string, entry: EntryKind, level?: number) => {
      let ladder: string[] | null = null;
      if (endpoint && entry === "normal") {
        ladder = await tryRemoteEngine(endpoint, title);
        if (!ladder) dispatch({ type: "toast", msg: "AI is taking a break — the built-in engine has you." });
      }
      dispatch({ type: "enterTask", title, entry, ladderOverride: ladder, level });
    },
    [endpoint],
  );

  const profile = useMemo(() => computeProfile(state.sessions), [state.sessions]);

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
