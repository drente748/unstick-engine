import { useEffect, useState } from "react";
import { useApp } from "../state/store";
import { Btn, Icon } from "../components/ui";

/** Micro Start Mode — for when starting feels impossible. */
export default function Micro() {
  const { state, dispatch } = useApp();
  const [beat, setBeat] = useState(0);
  const draft = state.draft;

  useEffect(() => {
    if (!draft) dispatch({ type: "nav", screen: { id: "home" } });
  }, [draft, dispatch]);
  if (!draft) return null;

  const tiny = draft.override ?? "Just open it. Nothing else.";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-5 pb-16 pt-14 sm:pt-24">
      <p className="kicker anim-fadeUp text-butter-400">Micro start mode</p>
      <div className="mt-3 flex items-center gap-2.5 text-ink-mute">
        <span
          className="h-2.5 w-2.5 rounded-full bg-butter-400"
          style={{ animation: "breathe 3.2s ease-in-out infinite" }}
        />
        <span className="text-sm font-bold">No task today. Just a doorway.</span>
      </div>

      <div key={beat} className="anim-pop mt-10" aria-live="polite">
        {beat === 0 && (
          <>
            <h2 className="font-display text-4xl font-extrabold leading-tight text-ink sm:text-6xl">
              Don't do the task.
            </h2>
            <p className="mt-5 max-w-md text-lg text-ink-dim">
              Seriously — not today, not yet. “{draft.title}” can wait. We're not touching it.
            </p>
            <Btn variant="quiet" size="lg" className="mt-9" onClick={() => setBeat(1)}>
              Okay… <Icon n="arrow" className="h-4 w-4" />
            </Btn>
          </>
        )}
        {beat === 1 && (
          <>
            <h2 className="font-display text-4xl font-extrabold leading-tight text-ink sm:text-6xl">
              Just open it.
            </h2>
            <p className="mt-5 max-w-md text-lg text-ink-dim">
              That's enough for now. Opening counts. That's the whole move:
            </p>
            <p className="card mt-5 inline-block border-ember-400/50 px-5 py-3.5 text-lg font-bold text-ember-300">
              {tiny}
            </p>
            <div className="mt-8">
              <Btn variant="quiet" size="lg" onClick={() => setBeat(2)}>
                I can do that <Icon n="arrow" className="h-4 w-4" />
              </Btn>
            </div>
          </>
        )}
        {beat === 2 && (
          <>
            <h2 className="font-display text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
              Want the next 10-second step?
            </h2>
            <p className="mt-5 max-w-md text-lg text-ink-dim">
              Ten seconds, then you're free to walk away. You already did the hard part — you showed up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Btn
                variant="primary"
                size="lg"
                onClick={() => dispatch({ type: "start", durationSec: 10, bodyDouble: false, kind: "micro" })}
              >
                YES · 10 seconds <Icon n="play" className="h-4 w-4" />
              </Btn>
              <Btn
                size="lg"
                onClick={() => {
                  dispatch({ type: "nav", screen: { id: "home" } });
                  dispatch({ type: "toast", msg: "Okay. Starting counts whenever it happens." });
                }}
              >
                NOT YET
              </Btn>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className="linkline mt-14 self-start text-sm"
        onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
      >
        ← back, no pressure
      </button>
    </div>
  );
}
