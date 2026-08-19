import { useEffect } from "react";
import { useApp } from "../state/store";
import { Btn, Icon, Live } from "../components/ui";
import { currentAction } from "../engine/localEngine";

/** One-Tap Start — one action, one button, zero decisions. */
export default function OneStep() {
  const { state, dispatch } = useApp();
  const draft = state.draft;

  useEffect(() => {
    if (!draft) dispatch({ type: "nav", screen: { id: "home" } });
  }, [draft, dispatch]);
  if (!draft) return null;

  const action = currentAction(draft.domain, draft.level, 0, draft.override, draft.ladderOverride);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-5 pb-16 pt-12 sm:pt-20">
      <Live msg={`Next tiny action: ${action}`} />
      <div className="flex items-center gap-2.5">
        <span
          className="h-2.5 w-2.5 rounded-full bg-ember-400"
          style={{ animation: "breathe 2.6s ease-in-out infinite" }}
        />
        <p className="kicker anim-fadeUp text-ember-400">{draft.note ?? "one tiny step"}</p>
      </div>

      <h2
        key={action}
        className="font-display anim-pop mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[3.4rem]"
      >
        {action}
      </h2>
      <p className="anim-fadeUp mt-5 text-lg text-ink-dim" style={{ animationDelay: "0.1s" }}>
        Nothing else exists right now. “{draft.title}” can wait behind this one move.
      </p>

      <div className="anim-fadeUp" style={{ animationDelay: "0.16s" }}>
        <Btn
          autoFocus
          variant="primary"
          size="lg"
          className="mt-9 w-full sm:w-auto"
          onClick={() => dispatch({ type: "start", durationSec: 10, bodyDouble: false })}
        >
          GO — 10 SECONDS <Icon n="play" className="h-4 w-4" />
        </Btn>
      </div>

      <div
        className="anim-fadeUp mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        style={{ animationDelay: "0.22s" }}
      >
        {draft.level < 4 && (
          <button type="button" className="linkline" onClick={() => dispatch({ type: "resize", delta: 1 })}>
            smaller ↓
          </button>
        )}
        <button
          type="button"
          className="linkline"
          onClick={() => dispatch({ type: "nav", screen: { id: "statecheck" } })}
        >
          why can't I start?
        </button>
        <button type="button" className="linkline" onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}>
          not now
        </button>
      </div>
    </div>
  );
}
