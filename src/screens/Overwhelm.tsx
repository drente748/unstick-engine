import { useState, type FormEvent } from "react";
import { useApp } from "../state/store";
import { Btn, Icon } from "../components/ui";
import { currentAction } from "../engine/localEngine";

/** Anti-Overwhelm Mode — everything is removed except ONE thing. */
export default function Overwhelm() {
  const { state, dispatch, submitTask } = useApp();
  const draft = state.draft;
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [task, setTask] = useState("");
  const [err, setErr] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = task.trim();
    if (!t) {
      setErr(true);
      setTimeout(() => setErr(false), 650);
      return;
    }
    void submitTask(t, "overwhelm", 2);
    setPhase(2);
  }

  const action = draft
    ? currentAction(draft.domain, draft.level, 0, draft.override, draft.ladderOverride)
    : "";

  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-pine-950/[0.97]" role="dialog" aria-modal="true" aria-label="Anti-overwhelm mode">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-5 py-14">
        {phase === 0 && (
          <div className="anim-pop">
            <p className="kicker text-butter-400">anti-overwhelm mode</p>
            <h2 className="font-display mt-5 text-5xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-7xl">
              Okay. No planning.
            </h2>
            <p className="mt-6 max-w-md text-lg text-ink-dim">
              The lists, the strategy, the guilt — all off. We're doing exactly one thing, and it's very, very small.
            </p>
            <Btn variant="primary" size="lg" className="mt-9" onClick={() => setPhase(1)}>
              Good. <Icon n="arrow" className="h-4 w-4" />
            </Btn>
          </div>
        )}

        {phase === 1 && (
          <div className="anim-pop">
            <p className="kicker text-butter-400">one thing. just one.</p>
            <h2 className="font-display mt-5 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
              Tell me ONE thing you're trying to start.
            </h2>
            <form className={`mt-8 space-y-3 ${err ? "shake" : ""}`} onSubmit={submit}>
              <label htmlFor="overwhelm-input" className="sr-only">
                The one thing you are trying to start
              </label>
              <input
                id="overwhelm-input"
                type="text"
                autoFocus
                className={`field ${err ? "field-error" : ""}`}
                placeholder="anything — even one word"
                value={task}
                maxLength={120}
                onChange={(e) => setTask(e.target.value)}
                autoComplete="off"
              />
              <Btn type="submit" variant="primary" size="lg" className="w-full">
                THAT ONE <Icon n="arrow" className="h-4 w-4" />
              </Btn>
            </form>
          </div>
        )}

        {phase === 2 && !draft && (
          <div className="anim-fadeIn flex items-center gap-3 text-ink-mute">
            <span
              className="h-2.5 w-2.5 rounded-full bg-butter-400"
              style={{ animation: "breathe 1.6s ease-in-out infinite" }}
            />
            <p className="font-bold">Making it small…</p>
          </div>
        )}

        {phase === 2 && draft && (
          <div className="anim-pop">
            <p className="kicker text-butter-400">just this · nothing else</p>
            <h2 className="font-display mt-6 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
              {action}
            </h2>
            <p className="mt-5 max-w-md text-lg text-ink-dim">
              The rest of “{draft.title}” doesn't exist for the next ten seconds. Only this move.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Btn
                variant="primary"
                size="lg"
                onClick={() => dispatch({ type: "start", durationSec: 10, bodyDouble: false })}
              >
                START · 10 SECONDS <Icon n="play" className="h-4 w-4" />
              </Btn>
              {draft.level < 4 && (
                <Btn
                  size="lg"
                  onClick={() => dispatch({ type: "setLevel", level: draft.level + 1 })}
                >
                  <Icon n="chevronsDown" className="h-4 w-4" /> smaller
                </Btn>
              )}
              <Btn variant="quiet" size="lg" onClick={() => dispatch({ type: "clearPending" })}>
                not now
              </Btn>
            </div>
          </div>
        )}

        <button
          type="button"
          className="linkline mt-12 self-start text-sm"
          onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
        >
          ← exit the quiet room
        </button>
      </div>
    </div>
  );
}
