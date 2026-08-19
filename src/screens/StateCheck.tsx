import { useState, type FormEvent } from "react";
import { useApp } from "../state/store";
import { Btn, Icon } from "../components/ui";
import { BLOCKERS } from "../engine/localEngine";

/** “Why can't I start?” — a lightweight pre-start state check. */
export default function StateCheck() {
  const { state, dispatch, submitTask } = useApp();
  const draft = state.draft;
  const [title, setTitle] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (t) await submitTask(t, "statecheck");
  }

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-12 sm:pt-20">
        <p className="kicker anim-fadeUp text-clay-300">state check</p>
        <h2
          className="font-display anim-fadeUp mt-4 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl"
          style={{ animationDelay: "0.06s" }}
        >
          First — what's the thing?
        </h2>
        <p className="anim-fadeUp mt-4 text-lg text-ink-dim" style={{ animationDelay: "0.12s" }}>
          Name it in one line. Then we'll find what's actually in the way.
        </p>
        <form className="anim-fadeUp mt-8 space-y-3" style={{ animationDelay: "0.18s" }} onSubmit={(e) => void submit(e)}>
          <label htmlFor="statecheck-input" className="sr-only">
            The task you can't start
          </label>
          <input
            id="statecheck-input"
            type="text"
            className="field"
            placeholder="e.g. “start my project”"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
          <Btn type="submit" variant="primary" size="lg" className="w-full">
            CONTINUE <Icon n="arrow" className="h-4 w-4" />
          </Btn>
        </form>
        <button
          type="button"
          className="linkline anim-fadeUp mt-6 text-sm"
          style={{ animationDelay: "0.24s" }}
          onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
        >
          ← back home
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <p className="kicker anim-fadeUp text-clay-300">
        state check · <span className="text-ink-mute">“{draft.title}”</span>
      </p>
      <h2
        id="statecheck-heading"
        className="font-display anim-fadeUp mt-4 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl"
        style={{ animationDelay: "0.06s" }}
      >
        Why can't I start?
      </h2>
      <p className="anim-fadeUp mt-3 text-lg text-ink-dim" style={{ animationDelay: "0.1s" }}>
        Name the blocker — the engine picks the counter-move. Guessing is fine.
      </p>

      <div className="mt-8 grid gap-2.5 sm:grid-cols-2" role="group" aria-labelledby="statecheck-heading">
        {BLOCKERS.map((b, i) => (
          <button
            key={b.v}
            type="button"
            className="card anim-fadeUp group flex items-start gap-3.5 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-clay-400/70 hover:bg-pine-800"
            style={{ animationDelay: `${0.12 + i * 0.045}s` }}
            onClick={() => dispatch({ type: "answerBlocker", blocker: b.v })}
          >
            <Icon n={b.icon} className="mt-0.5 h-5 w-5 shrink-0 text-clay-300" />
            <span className="min-w-0">
              <span className="block font-bold text-ink-dim group-hover:text-ink">{b.label}</span>
              <span className="mt-0.5 block text-xs text-ink-mute">→ {b.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="linkline anim-fadeUp mt-8 text-sm"
        style={{ animationDelay: "0.5s" }}
        onClick={() => dispatch({ type: "nav", screen: { id: "onestep" } })}
      >
        skip — just show me the smallest step →
      </button>
    </div>
  );
}
