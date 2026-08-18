import { useEffect } from "react";
import { useApp } from "../state/store";
import { Icon } from "../components/ui";
import type { Difficulty } from "../engine/types";

const OPTIONS: Array<{ v: Difficulty; emoji: string; label: string; sub: string }> = [
  { v: "easy", emoji: "😌", label: "Easy", sub: "then let's just go" },
  { v: "abit", emoji: "😐", label: "A little hard", sub: "we'll find one small step" },
  { v: "hard", emoji: "😣", label: "Hard", sub: "we'll break it down" },
  { v: "impossible", emoji: "🧱", label: "Impossible", sub: "micro start mode" },
];

export default function Threshold() {
  const { state, dispatch } = useApp();
  const task = state.screen.id === "threshold" ? state.screen.task : "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0) dispatch({ type: "difficulty", value: OPTIONS[i].v });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-16">
      <p className="kicker anim-fadeUp">
        Step 1 · the friction check <span className="text-ink-mute">(keys 1–4)</span>
      </p>
      <h2
        id="threshold-heading"
        className="font-display anim-fadeUp mt-4 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl"
        style={{ animationDelay: "0.06s" }}
      >
        How hard does starting feel right now?
      </h2>
      {task && (
        <p className="anim-fadeUp mt-3 text-base text-ink-mute" style={{ animationDelay: "0.1s" }}>
          about: <span className="font-bold text-butter-300">“{task}”</span>
        </p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2" role="group" aria-labelledby="threshold-heading">
        {OPTIONS.map((o, i) => (
          <button
            key={o.v}
            type="button"
            className="card anim-fadeUp group flex items-center gap-4 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ember-400/70 hover:bg-pine-800"
            style={{ animationDelay: `${0.14 + i * 0.07}s` }}
            onClick={() => dispatch({ type: "difficulty", value: o.v })}
          >
            <span className="text-3xl" aria-hidden="true">
              {o.emoji}
            </span>
            <span className="min-w-0">
              <span className="font-display block text-lg font-bold text-ink">
                {o.label}
                <span className="ml-2 align-middle font-timer text-[11px] text-ink-mute">{i + 1}</span>
              </span>
              <span className="block text-sm text-ink-mute">{o.sub}</span>
            </span>
            <Icon
              n="arrow"
              className="ml-auto h-5 w-5 shrink-0 text-ink-mute transition-transform duration-200 group-hover:translate-x-1 group-hover:text-ember-400"
            />
          </button>
        ))}
      </div>

      <p className="anim-fadeUp mt-6 text-sm text-ink-mute" style={{ animationDelay: "0.5s" }}>
        There's no wrong answer. “Impossible” is where this app earns its keep.
      </p>
      <button type="button" className="linkline anim-fadeUp mt-6 text-sm" style={{ animationDelay: "0.55s" }} onClick={() => dispatch({ type: "clearPending" })}>
        ← change the task
      </button>
    </div>
  );
}
