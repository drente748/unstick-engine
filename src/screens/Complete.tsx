import { useEffect, useState } from "react";
import { useApp } from "../state/store";
import { Btn, Icon, Live, formatClock } from "../components/ui";
import type { FeedbackKind, Outcome } from "../engine/types";

const FEEDBACKS: Array<{ v: FeedbackKind; label: string }> = [
  { v: "worked", label: "That worked" },
  { v: "tooBig", label: "Too big" },
  { v: "stuck", label: "Still stuck" },
  { v: "irrelevant", label: "Not relevant" },
];

export default function Complete() {
  const { state, dispatch } = useApp();
  const [answered, setAnswered] = useState<Outcome | null>(null);
  const [fb, setFb] = useState<FeedbackKind | null>(null);
  const draft = state.draft;
  const session = draft?.sessionId ? state.sessions.find((s) => s.id === draft.sessionId) : undefined;

  useEffect(() => {
    if (!draft) dispatch({ type: "nav", screen: { id: "home" } });
  }, [draft, dispatch]);
  if (!draft) return null;

  const steps = session?.steps ?? draft.stepsDone;
  const seconds = session?.seconds ?? 0;
  const rescues = session?.rescues ?? draft.rescues;

  function answer(o: Outcome) {
    setAnswered(o);
    dispatch({ type: "answer", outcome: o });
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-14 sm:pt-20">
      {!answered && (
        <>
          <p className="kicker anim-fadeUp text-mint-400">session over — the important part happened</p>
          <h2 className="font-display anim-pop mt-4 text-5xl font-extrabold tracking-tight text-mint-300 sm:text-7xl">
            You started.
          </h2>
          <p className="anim-fadeUp mt-4 text-lg text-ink-dim">
            That's the whole trick. Finishing was never the entry fee.
          </p>

          <div className="anim-fadeUp mt-7 flex flex-wrap gap-2.5" style={{ animationDelay: "0.12s" }}>
            <span className="chip cursor-default text-xs">
              <Icon n="check" className="h-3.5 w-3.5 text-mint-400" /> {steps} tiny step{steps === 1 ? "" : "s"}
            </span>
            <span className="chip cursor-default text-xs">
              <Icon n="clock" className="h-3.5 w-3.5 text-mint-400" /> {formatClock(seconds)} in motion
            </span>
            {rescues > 0 && (
              <span className="chip cursor-default text-xs">
                <Icon n="lifebuoy" className="h-3.5 w-3.5 text-clay-300" /> rescued {rescues}× — still here
              </span>
            )}
          </div>

          <div className="anim-fadeUp mt-10" style={{ animationDelay: "0.2s" }}>
            <p className="font-display text-xl font-bold text-ink">What happened next?</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              <Btn variant="mint" onClick={() => answer("kept")}>
                I KEPT GOING
              </Btn>
              <Btn variant="ghost" onClick={() => answer("stopped")}>
                I STOPPED
              </Btn>
              <Btn variant="clay" onClick={() => answer("stuck")}>
                I GOT STUCK
              </Btn>
            </div>
            <Live msg="Session complete. You started." />
          </div>
        </>
      )}

      {answered === "kept" && (
        <div className="anim-pop">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Momentum. <span className="text-mint-400">Ride it.</span>
          </h2>
          <p className="mt-4 max-w-md text-lg text-ink-dim">
            You didn't need motivation — you needed a doorway. Keep going while it's warm, or stop here and count the
            win.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn variant="primary" size="lg" onClick={() => dispatch({ type: "start", durationSec: 600, bodyDouble: false })}>
              CONTINUE · 10 MIN <Icon n="play" className="h-4 w-4" />
            </Btn>
            <Btn
              size="lg"
              onClick={() => {
                dispatch({ type: "clearPending" });
                dispatch({ type: "toast", msg: "Go be a person who started. See you whenever." });
              }}
            >
              WRAP UP
            </Btn>
          </div>
          {draft.level > 0 && (
            <button
              type="button"
              className="linkline mt-5 text-sm"
              onClick={() => {
                dispatch({ type: "resize", delta: -1 });
                dispatch({ type: "nav", screen: { id: "shrinker" } });
              }}
            >
              feeling strong? grow the next step ↑
            </button>
          )}
        </div>
      )}

      {answered === "stopped" && !fb && (
        <div className="anim-pop">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">That's okay.</h2>
          <p className="mt-4 max-w-md text-lg text-ink-dim">
            You still started, and stopping is allowed here. One quick note helps the engine aim better next time.
          </p>
          <p className="font-display mt-7 text-lg font-bold text-ink">How did that step feel?</p>
          <div className="mt-3.5 flex flex-wrap gap-2.5" role="group" aria-label="Step feedback">
            {FEEDBACKS.map((f) => (
              <button
                key={f.v}
                type="button"
                className="chip"
                onClick={() => {
                  setFb(f.v);
                  dispatch({ type: "feedback", kind: f.v });
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {answered === "stopped" && fb && (
        <div className="anim-pop">
          <Live msg={`New next step: ${draft.override ?? ""}`} />
          <p className="kicker text-butter-400">noted — recalibrated</p>
          <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Here's the next tiny move.
          </h2>
          {draft.note && <p className="mt-2 text-sm text-ink-mute">{draft.note}</p>}
          <p className="card mt-5 border-mint-400/50 px-5 py-4 text-xl font-bold leading-snug text-mint-300">
            {draft.override}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Btn
              variant="primary"
              size="lg"
              onClick={() => dispatch({ type: "start", durationSec: 10, bodyDouble: false })}
            >
              GO — 10 SECONDS <Icon n="play" className="h-4 w-4" />
            </Btn>
            <Btn variant="quiet" size="lg" onClick={() => dispatch({ type: "clearPending" })}>
              DONE FOR NOW
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
