import { useEffect, useState } from "react";
import { useApp } from "../state/store";
import { Btn, Icon, Live, formatClock } from "../components/ui";
import { rescueStrategy } from "../engine/localEngine";
import type { RescueResult, StuckReason } from "../engine/types";

const REASONS: Array<{ v: StuckReason; label: string }> = [
  { v: "unknown-next", label: "I don't know what to do next" },
  { v: "too-big", label: "The task feels too big" },
  { v: "distracted", label: "I'm distracted" },
  { v: "tired", label: "I'm tired" },
  { v: "afraid", label: "I'm afraid I'll do it wrong" },
  { v: "lost-interest", label: "I lost interest" },
  { v: "dont-want", label: "I don't want to do it" },
  { v: "dont-know", label: "I don't know" },
];

export default function Rescue() {
  const { state, dispatch } = useApp();
  const [picked, setPicked] = useState<StuckReason | null>(null);
  const [result, setResult] = useState<RescueResult | null>(null);
  const draft = state.draft;

  function pick(reason: StuckReason) {
    if (!draft) return;
    dispatch({ type: "rescued" });
    const res = rescueStrategy(draft.domain, reason, draft.level);
    if (res.reset) {
      dispatch({
        type: "nav",
        screen: { id: "reset", returnTo: draft.startedAt > 0 ? "focus" : "shrinker" },
      });
      return;
    }
    setPicked(reason);
    setResult(res);
  }

  function tryThis() {
    if (!draft || !result) return;
    dispatch({ type: "applyRescue", action: result.action, level: result.level });
    if (result.level !== undefined) dispatch({ type: "nav", screen: { id: "shrinker" } });
    else
      dispatch({
        type: "nav",
        screen: { id: "focus", durationSec: 10, bodyDouble: false },
      });
  }

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 pt-20 text-center">
        <p className="text-lg text-ink-dim">Stuck on something? Tell me what it is first.</p>
        <Btn variant="primary" className="mt-6" onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}>
          Name the task <Icon n="arrow" className="h-4 w-4" />
        </Btn>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <p className="kicker anim-fadeUp text-clay-300">Rescue mode</p>
      <h2
        id="rescue-heading"
        className="font-display anim-fadeUp mt-4 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl"
      >
        Okay. Let's figure out what's blocking you.
      </h2>
      <p className="anim-fadeUp mt-3 text-ink-dim">
        Stuck is not broken. It's a signal — pick the closest one. Guessing is fine.
      </p>

      {!result && (
        <div className="mt-8 grid gap-2.5 sm:grid-cols-2" role="group" aria-labelledby="rescue-heading">
          {REASONS.map((r, i) => (
            <button
              key={r.v}
              type="button"
              className="card anim-fadeUp p-4 text-left text-[0.95rem] font-bold text-ink-dim transition-all duration-200 hover:-translate-y-0.5 hover:border-clay-400/70 hover:text-ink"
              style={{ animationDelay: `${0.08 + i * 0.05}s` }}
              onClick={() => pick(r.v)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div key={picked} className="anim-pop mt-8">
          <Live msg={result.message} />
          <div className="card border-clay-400/40 p-6 sm:p-7">
            <p className="kicker mb-3 text-clay-300">the counter-move</p>
            <p className="font-display text-2xl font-extrabold leading-snug text-ink sm:text-3xl">{result.message}</p>
            {result.action && (
              <p className="mt-4 inline-block rounded-xl border border-ember-400/50 bg-pine-800 px-4 py-3 text-lg font-bold text-ember-300">
                {result.action}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Btn variant="primary" onClick={tryThis}>
                TRY THIS <Icon n="arrow" className="h-4 w-4" />
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  dispatch({ type: "setLevel", level: draft.level + 1 });
                  dispatch({ type: "nav", screen: { id: "shrinker" } });
                }}
                disabled={draft.level >= 4}
              >
                <Icon n="chevronsDown" className="h-4 w-4" /> Make it smaller
              </Btn>
              <Btn
                variant="quiet"
                onClick={() => {
                  setPicked(null);
                  setResult(null);
                }}
              >
                Something else
              </Btn>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="linkline anim-fadeUp mt-8 text-sm"
        onClick={() =>
          dispatch({
            type: "nav",
            screen: draft.startedAt > 0 ? { id: "focus", durationSec: 10, bodyDouble: false } : { id: "shrinker" },
          })
        }
      >
        ← never mind, take me back
      </button>
    </div>
  );
}

/** 60-second attention reset — for “I'm distracted”. */
export function Reset() {
  const { state, dispatch } = useApp();
  const screen = state.screen.id === "reset" ? state.screen : null;
  const [left, setLeft] = useState(60);

  useEffect(() => {
    const iv = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (left === 0 && screen) {
      dispatch({
        type: "nav",
        screen: screen.returnTo === "focus" ? { id: "focus", durationSec: 60, bodyDouble: false } : { id: "shrinker" },
      });
    }
  }, [left, screen, dispatch]);

  if (!screen) return null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 pt-16 text-center sm:pt-24">
      <Live msg={left > 0 ? `Reset: ${left} seconds left` : "Reset complete"} />
      <p className="kicker anim-fadeUp text-butter-400">60-second reset</p>
      <div
        className="mt-10 flex h-44 w-44 items-center justify-center rounded-full border-2 border-butter-400/60"
        style={{ animation: "breathe 6s ease-in-out infinite" }}
      >
        <span className="timer-font text-5xl font-bold text-butter-300">{formatClock(left)}</span>
      </div>
      <h2 className="font-display anim-fadeUp mt-9 text-2xl font-extrabold text-ink sm:text-3xl">
        Breathe. Look at something far away.
      </h2>
      <p className="anim-fadeUp mt-3 max-w-sm text-ink-dim">
        The task isn't going anywhere. Distraction is a wave — it passes on its own.
      </p>
      <button
        type="button"
        className="linkline anim-fadeUp mt-8 text-sm"
        onClick={() =>
          dispatch({
            type: "nav",
            screen:
              screen.returnTo === "focus" ? { id: "focus", durationSec: 60, bodyDouble: false } : { id: "shrinker" },
          })
        }
      >
        skip the reset →
      </button>
    </div>
  );
}
