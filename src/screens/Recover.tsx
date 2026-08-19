import { useEffect } from "react";
import { useApp } from "../state/store";
import { Btn, Icon, Live } from "../components/ui";
import { currentAction } from "../engine/localEngine";

/** Interruption & restart recovery — back to the smallest NEXT action, never a restart. */
export default function Recover() {
  const { state, dispatch } = useApp();
  const draft = state.draft;

  useEffect(() => {
    if (!draft) dispatch({ type: "nav", screen: { id: "home" } });
  }, [draft, dispatch]);
  if (!draft) return null;

  const action = currentAction(draft.domain, draft.level, 0, draft.override, draft.ladderOverride);

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-12 sm:pt-20">
      <Live msg={`Welcome back. Next tiny action: ${action}`} />
      <p className="kicker anim-fadeUp text-mint-400">recovery</p>
      <h2
        className="font-display anim-pop mt-4 text-5xl font-extrabold tracking-tight text-ink sm:text-6xl"
      >
        Welcome back.
      </h2>
      <p className="anim-fadeUp mt-4 text-lg leading-relaxed text-ink-dim" style={{ animationDelay: "0.08s" }}>
        Nothing to restart — re-entry doesn't cost the whole task.
        {draft.stepsDone > 0 &&
          ` You already banked ${draft.stepsDone} tiny step${draft.stepsDone === 1 ? "" : "s"}; those still count.`}{" "}
        Here's the next tiny move, one notch smaller than before:
      </p>

      <p
        key={action}
        className="card anim-pop mt-6 border-mint-400/50 px-5 py-4 text-xl font-bold leading-snug text-mint-300 sm:text-2xl"
        style={{ animationDelay: "0.14s" }}
      >
        {action}
      </p>

      <div className="anim-fadeUp mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.2s" }}>
        <Btn
          variant="primary"
          size="lg"
          onClick={() => dispatch({ type: "start", durationSec: 10, bodyDouble: false })}
        >
          GO — 10 SECONDS <Icon n="play" className="h-4 w-4" />
        </Btn>
        {draft.level < 4 && (
          <Btn size="lg" onClick={() => dispatch({ type: "resize", delta: 1 })}>
            <Icon n="chevronsDown" className="h-4 w-4" /> even smaller
          </Btn>
        )}
      </div>

      <button
        type="button"
        className="linkline anim-fadeUp mt-7 text-sm"
        style={{ animationDelay: "0.26s" }}
        onClick={() => dispatch({ type: "clearPending" })}
      >
        different task →
      </button>
    </div>
  );
}
