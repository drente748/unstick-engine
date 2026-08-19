import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  Difficulty,
  Draft,
  EntryKind,
  Outcome,
  Screen,
  SessionKind,
  SessionRecord,
  Settings,
} from "../engine/types";
import { detectDomain, tryRemoteEngine } from "../engine/localEngine";
import { DEFAULT_SETTINGS, clearPersisted, loadPersisted, savePersisted, uid } from "../lib/persist";

export interface State {
  screen: Screen;
  draft: Draft | null;
  sessions: SessionRecord[];
  settings: Settings;
  paused: boolean;
  toast: { id: number; msg: string } | null;
}

export type Action =
  | { type: "nav"; screen: Screen }
  | { type: "enterTask"; title: string; entry: EntryKind; level?: number; ladderOverride?: string[] | null }
  | { type: "difficulty"; value: Difficulty }
  | { type: "setLevel"; level: number }
  | { type: "start"; durationSec: number; bodyDouble: boolean; kind?: SessionKind }
  | { type: "next" }
  | { type: "rescued" }
  | { type: "applyRescue"; action?: string; level?: number }
  | { type: "endSession" }
  | { type: "answer"; outcome: Outcome }
  | { type: "restartSmaller" }
  | { type: "clearPending" }
  | { type: "pause"; value: boolean }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "clearData" }
  | { type: "toast"; msg: string }
  | { type: "untoast" };

function makeDraft(title: string, level: number, ladderOverride: string[] | null): Draft {
  return {
    title: title.trim(),
    domain: detectDomain(title),
    level,
    stepIndex: 0,
    stepsDone: 0,
    rescues: 0,
    startedAt: 0,
    sessionId: null,
    kind: "focus",
    override: null,
    ladderOverride,
  };
}

function patchSession(sessions: SessionRecord[], id: string | null, patch: Partial<SessionRecord>) {
  if (!id) return sessions;
  return sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function withStart(state: State, durationSec: number, bodyDouble: boolean, kind: SessionKind): State {
  if (!state.draft) return state;
  const id = uid();
  const rec: SessionRecord = {
    id,
    title: state.settings.saveTitles ? state.draft.title : null,
    domain: state.draft.domain,
    kind,
    startedAt: Date.now(),
    endedAt: null,
    seconds: 0,
    steps: 0,
    rescues: 0,
    outcome: null,
  };
  return {
    ...state,
    sessions: [...state.sessions, rec],
    draft: { ...state.draft, startedAt: rec.startedAt, sessionId: id, stepsDone: 0, rescues: 0, kind },
    paused: false,
    screen: { id: "focus", durationSec, bodyDouble },
  };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "nav":
      return { ...state, screen: a.screen, paused: false };

    case "enterTask": {
      const draft = makeDraft(a.title, a.level ?? 0, a.ladderOverride ?? null);
      const screen: Screen =
        a.entry === "normal"
          ? { id: "threshold", task: draft.title }
          : a.entry === "ten"
            ? { id: "quick" }
            : a.entry === "overwhelm"
              ? { id: "overwhelm" }
              : { id: "shrinker" };
      return { ...state, draft, screen, paused: false };
    }

    case "difficulty": {
      if (!state.draft) return state;
      if (a.value === "easy") return withStart(state, 300, false, "focus");
      if (a.value === "impossible")
        return { ...state, draft: { ...state.draft, level: 3 }, screen: { id: "micro" } };
      const level = a.value === "abit" ? 1 : 2;
      return { ...state, draft: { ...state.draft, level }, screen: { id: "shrinker" } };
    }

    case "setLevel": {
      if (!state.draft) return state;
      return { ...state, draft: { ...state.draft, level: Math.min(Math.max(a.level, 0), 4), override: null } };
    }

    case "start":
      return withStart(state, a.durationSec, a.bodyDouble, a.kind ?? "focus");

    case "next": {
      if (!state.draft) return state;
      const draft = {
        ...state.draft,
        stepIndex: state.draft.stepIndex + 1,
        stepsDone: state.draft.stepsDone + 1,
        override: null,
      };
      return { ...state, draft, sessions: patchSession(state.sessions, draft.sessionId, { steps: draft.stepsDone }) };
    }

    case "rescued": {
      if (!state.draft) return state;
      const draft = { ...state.draft, rescues: state.draft.rescues + 1 };
      return { ...state, draft, sessions: patchSession(state.sessions, draft.sessionId, { rescues: draft.rescues }) };
    }

    case "applyRescue": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          override: a.action !== undefined ? a.action : null,
          level: a.level !== undefined ? Math.min(a.level, 4) : state.draft.level,
        },
      };
    }

    case "endSession": {
      if (!state.draft) return state;
      const seconds = Math.max(0, Math.round((Date.now() - state.draft.startedAt) / 1000));
      return {
        ...state,
        paused: false,
        sessions: patchSession(state.sessions, state.draft.sessionId, {
          endedAt: Date.now(),
          seconds,
          steps: state.draft.stepsDone,
          rescues: state.draft.rescues,
        }),
        screen: { id: "complete" },
      };
    }

    case "answer": {
      if (!state.draft) return { ...state, screen: { id: "home" } };
      const sessions = patchSession(state.sessions, state.draft.sessionId, { outcome: a.outcome });
      if (a.outcome === "stuck") return { ...state, sessions, screen: { id: "rescue" } };
      return { ...state, sessions };
    }

    case "restartSmaller": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          level: Math.min(state.draft.level + 1, 4),
          startedAt: 0,
          sessionId: null,
          stepsDone: 0,
          rescues: 0,
          stepIndex: 0,
          override: null,
        },
        screen: { id: "shrinker" },
      };
    }

    case "clearPending":
      return { ...state, draft: null, screen: { id: "home" }, paused: false };

    case "pause":
      return { ...state, paused: a.value };

    case "settings":
      return { ...state, settings: { ...state.settings, ...a.patch } };

    case "clearData":
      clearPersisted();
      return { ...state, sessions: [], draft: null, screen: { id: "home" }, toast: null };

    case "toast":
      return { ...state, toast: { id: Date.now(), msg: a.msg } };

    case "untoast":
      return { ...state, toast: null };

    default:
      return state;
  }
}

function init(): State {
  const p = loadPersisted();
  return {
    screen: { id: "home" },
    draft: p.pending,
    sessions: p.sessions,
    settings: p.settings,
    paused: false,
    toast: null,
  };
}

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
  /** Enters a task; optionally asks the configured AI provider first, always falls back. */
  submitTask: (title: string, entry: EntryKind, level?: number) => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

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

  return <AppCtx.Provider value={{ state, dispatch, submitTask }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export { DEFAULT_SETTINGS };
