import { useState, type FormEvent } from "react";
import { useApp } from "../state/store";
import { Btn, DurationPicker, Icon, Live } from "../components/ui";
import { LEVEL_LABELS, STRATEGY_LABEL, minimumViable, previewSteps } from "../engine/localEngine";

const TITLE_SIZES = [
  "clamp(1.9rem, 5vw, 3rem)",
  "clamp(1.5rem, 4.2vw, 2.25rem)",
  "clamp(1.2rem, 3.6vw, 1.6rem)",
  "1.2rem",
  "1.05rem",
];

export default function Shrinker() {
  const { state, dispatch, submitTask, profile } = useApp();
  const draft = state.draft;
  const [title, setTitle] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [err, setErr] = useState(false);

  /* Entry variant: the Shrinker as a standalone door from home. */
  if (!draft) {
    function submitStandalone(e: FormEvent) {
      e.preventDefault();
      const t = title.trim();
      if (!t) {
        setErr(true);
        setTimeout(() => setErr(false), 650);
        return;
      }
      void submitTask(t, "shrinker");
    }
    return (
      <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-12 sm:pt-20">
        <p className="kicker anim-fadeUp text-mint-400">Task shrinker</p>
        <h2 className="font-display anim-fadeUp mt-4 text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
          Paste the big, scary thing.
        </h2>
        <p className="anim-fadeUp mt-4 text-lg text-ink-dim">
          We'll keep asking <em>“can we make this smaller?”</em> until it fits in one physical move.
        </p>
        <form className={`anim-fadeUp mt-8 space-y-3 ${err ? "shake" : ""}`} onSubmit={submitStandalone}>
          <label htmlFor="shrinker-input" className="kicker block">
            The intimidating task
          </label>
          <input
            id="shrinker-input"
            type="text"
            className={`field ${err ? "field-error" : ""}`}
            placeholder="e.g. “write a complete blog article”"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
          <Btn type="submit" variant="mint" size="lg" className="w-full">
            SHRINK IT <Icon n="chevronsDown" className="h-5 w-5" />
          </Btn>
        </form>
        <button
          type="button"
          className="linkline anim-fadeUp mt-6 text-sm"
          onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
        >
          ← back home
        </button>
      </div>
    );
  }

  const preview = previewSteps(draft, profile);
  const ladder = preview.map((p) => p.action);
  const atFloor = draft.level >= 4;
  const started = draft.startedAt > 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <Live msg={`Task shrunk to level: ${LEVEL_LABELS[draft.level]}. First step: ${ladder[0]}`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="kicker anim-fadeUp">Task shrinker</p>
        <span className="flex flex-wrap justify-end gap-2">
          <span className="chip min-h-[30px] cursor-default py-1 text-xs text-butter-300">
            size: {LEVEL_LABELS[draft.level]}
          </span>
          {profile.bestSize != null && profile.confidence !== "none" && (
            <span className="chip min-h-[30px] cursor-default border-mint-500/50 py-1 text-xs text-mint-300">
              your sweet spot: {LEVEL_LABELS[profile.bestSize]}
            </span>
          )}
        </span>
      </div>

      {/* the task literally shrinks */}
      <p
        className="font-display anim-fadeUp mt-6 font-extrabold leading-tight text-ink-dim transition-all duration-500"
        style={{ fontSize: TITLE_SIZES[draft.level] }}
      >
        {draft.title}
      </p>

      <h2
        id="shrinker-heading"
        className="font-display anim-fadeUp mt-6 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl"
      >
        Let's make this <span className="text-mint-400">ridiculously small</span>.
      </h2>

      {/* the ladder */}
      <ol className="mt-7 space-y-2.5" key={draft.level} aria-label="Tiny steps" aria-labelledby="shrinker-heading">
        {ladder.map((step, i) => (
          <li
            key={`${draft.level}-${i}`}
            className={`anim-fadeUp rounded-2xl border p-4 transition-colors ${
              i === 0 ? "border-ember-400/60 bg-pine-800" : "border-line-soft bg-pine-850/60"
            }`}
            style={{ animationDelay: `${0.1 + i * 0.09}s`, marginLeft: `${Math.min(i * 14, 56)}px` }}
          >
            <div className="flex items-start gap-3.5">
              <span
                className={`timer-font mt-0.5 text-sm font-bold ${i === 0 ? "text-ember-400" : "text-ink-mute"}`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                {i === 0 && (
                  <span className="kicker mb-1 block text-[10px] text-ember-400">do this one ↓</span>
                )}
                <p
                  className={`font-bold leading-snug ${
                    i === 0 ? "text-lg text-ink sm:text-xl" : "text-[0.95rem] text-ink-dim"
                  }`}
                  style={{ fontSize: i === 0 ? undefined : `max(0.85rem, ${1 - i * 0.045}rem)` }}
                >
                  {step}
                </p>
                <span
                  className="mt-2 block h-[3px] rounded-full bg-pine-600"
                  style={{ width: `${Math.max(100 - i * (64 / Math.max(ladder.length - 1, 1)), 18)}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="anim-fadeUp mt-5 text-sm text-ink-mute">
        Minimum viable version: <strong className="text-butter-300">{minimumViable(draft.analysis)}</strong> — anything
        beyond that is a bonus, not a requirement.
      </p>

      {/* actions */}
      <div className="anim-fadeUp mt-8 space-y-3">
        <Btn
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => dispatch({ type: "start", durationSec: 10, bodyDouble: false })}
        >
          {started ? "GO BACK TO IT · 10 SECONDS" : "START STEP 1 · 10 SECONDS"}
          <Icon n="play" className="h-4 w-4" />
        </Btn>
        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="ghost" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
            <Icon n="clock" className="h-4 w-4" /> Choose how long
          </Btn>
          {atFloor ? (
            <span className="text-sm font-bold text-ink-mute">
              You're at the floor — this is as small as it gets. And it's enough.
            </span>
          ) : (
            <button
              type="button"
              className="linkline text-sm"
              onClick={() => dispatch({ type: "setLevel", level: draft.level + 1 })}
            >
              Can we make it smaller? ↓
            </button>
          )}
          {draft.level > 0 && (
            <button
              type="button"
              className="linkline text-sm"
              onClick={() => dispatch({ type: "resize", delta: -1 })}
            >
              too small? grow it ↑
            </button>
          )}
        </div>
        {pickerOpen && (
          <DurationPicker
            goLabel={started ? "GO BACK TO IT" : "START"}
            onGo={(sec, bd) => dispatch({ type: "start", durationSec: sec, bodyDouble: bd })}
          />
        )}
      </div>

      <button
        type="button"
        className="linkline anim-fadeUp mt-8 text-sm"
        onClick={() => dispatch({ type: "clearPending" })}
      >
        ← start over with a different task
      </button>
    </div>
  );
}
