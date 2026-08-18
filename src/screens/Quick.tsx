import { useState, type FormEvent } from "react";
import { useApp } from "../state/store";
import { Btn, Icon } from "../components/ui";

/** 10-Second Start — the goal is breaking the barrier, not completing anything. */
export default function Quick() {
  const { dispatch, submitTask } = useApp();
  const [task, setTask] = useState("");

  async function go(e?: FormEvent) {
    e?.preventDefault();
    await submitTask(task.trim() || "the thing you're avoiding", "ten");
    dispatch({ type: "start", durationSec: 10, bodyDouble: false, kind: "ten" });
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-12 sm:pt-20">
      <p className="kicker anim-fadeUp text-ember-400">10-second start</p>
      <h2
        className="font-display anim-fadeUp mt-4 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl"
        style={{ animationDelay: "0.06s" }}
      >
        Your only job: <span className="text-ember-400">10 seconds</span>.
      </h2>
      <p className="anim-fadeUp mt-4 text-lg text-ink-dim" style={{ animationDelay: "0.12s" }}>
        The goal isn't to finish. It's to break the seal. After ten seconds you may stop — and it still counts.
      </p>

      <form className="anim-fadeUp mt-9 space-y-4" style={{ animationDelay: "0.18s" }} onSubmit={(e) => void go(e)}>
        <label htmlFor="quick-input" className="kicker block">
          What are you starting? (optional)
        </label>
        <input
          id="quick-input"
          type="text"
          className="field"
          placeholder="e.g. “open the document”"
          value={task}
          maxLength={120}
          onChange={(e) => setTask(e.target.value)}
          autoComplete="off"
        />
        <Btn type="submit" variant="primary" size="lg" className="w-full">
          GO — 10 SECONDS <Icon n="play" className="h-4 w-4" />
        </Btn>
      </form>

      <p className="anim-fadeUp mt-6 text-sm text-ink-mute" style={{ animationDelay: "0.26s" }}>
        You still started. That's the metric that matters.
      </p>
      <button
        type="button"
        className="linkline anim-fadeUp mt-6 text-sm"
        style={{ animationDelay: "0.3s" }}
        onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
      >
        ← back home
      </button>
    </div>
  );
}
