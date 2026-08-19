import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "../state/store";
import { Btn, Icon } from "../components/ui";

const EXAMPLES = ["clean my room", "reply to emails", "do my taxes", "start my project", "study for my exam"];
const MICROCOPY = [
  "Don't finish it. Start it.",
  "Make it smaller.",
  "Starting counts.",
  "You're allowed to stop.",
  "Let's lower the bar.",
  "Stuck? That's useful information.",
  "One tiny step is a real step.",
];

export default function Home() {
  const { state, dispatch, submitTask } = useApp();
  const [task, setTask] = useState("");
  const [exIdx, setExIdx] = useState(0);
  const [mcIdx, setMcIdx] = useState(0);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const a = setInterval(() => setExIdx((i) => (i + 1) % EXAMPLES.length), 3800);
    const b = setInterval(() => setMcIdx((i) => (i + 1) % MICROCOPY.length), 5200);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const pending = state.draft;
  const today = new Date().toDateString();
  const startsToday = state.sessions.filter((s) => new Date(s.startedAt).toDateString() === today).length;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = task.trim();
    if (!t) {
      setErr(true);
      inputRef.current?.focus();
      setTimeout(() => setErr(false), 650);
      return;
    }
    void submitTask(t, "normal");
  }

  function oneTap() {
    const t = task.trim();
    if (!t) {
      setErr(true);
      inputRef.current?.focus();
      setTimeout(() => setErr(false), 650);
      return;
    }
    void submitTask(t, "onetap");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:pt-16">
      {/* recovery card */}
      {pending && (
        <section
          aria-label="Welcome back"
          className="anim-fadeUp card mb-10 border-butter-400/40 bg-pine-850/90 p-5 sm:p-6"
        >
          <p className="kicker mb-2 text-butter-400">Welcome back</p>
          <p className="text-lg font-bold text-ink">
            “{pending.title}” is still here. No pressure, no guilt — it kept your spot.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Btn variant="primary" onClick={() => dispatch({ type: "recover" })}>
              <Icon n="loop" className="h-4 w-4" /> Next tiny step
            </Btn>
            <Btn variant="mint" onClick={() => dispatch({ type: "restartSmaller" })}>
              <Icon n="chevronsDown" className="h-4 w-4" /> Start smaller
            </Btn>
            <Btn
              onClick={() => {
                dispatch({ type: "clearPending" });
                inputRef.current?.focus();
              }}
            >
              Change task
            </Btn>
            <Btn
              variant="quiet"
              onClick={() => {
                dispatch({ type: "clearPending" });
                dispatch({ type: "toast", msg: "Okay. It'll keep." });
              }}
            >
              Not now
            </Btn>
          </div>
        </section>
      )}

      {/* hero */}
      <section aria-labelledby="home-heading">
        <p className="chip anim-fadeUp mb-6 cursor-default text-xs" style={{ animationDelay: "0.05s" }}>
          <Icon n="spark" className="h-3.5 w-3.5 text-ember-400" />
          for the stuck, not the organized
        </p>
        <h1
          id="home-heading"
          className="font-display anim-fadeUp text-[clamp(3.2rem,12vw,6.8rem)] font-extrabold leading-[0.94] tracking-tight text-ink"
          style={{ animationDelay: "0.1s" }}
        >
          Can't{" "}
          <span className="relative inline-block whitespace-nowrap">
            start?
            <svg
              className="absolute -bottom-[0.14em] left-0 w-full"
              viewBox="0 0 220 26"
              fill="none"
              aria-hidden="true"
              preserveAspectRatio="none"
            >
              <path
                d="M5 17 C 62 7, 150 5, 215 13"
                stroke="var(--color-ember-500)"
                strokeWidth="8"
                strokeLinecap="round"
                className="draw-underline"
              />
            </svg>
          </span>
        </h1>
        <p className="anim-fadeUp mt-6 max-w-xl text-lg text-ink-dim sm:text-xl" style={{ animationDelay: "0.18s" }}>
          Let's make the first step <strong className="text-butter-300">ridiculously small</strong>. Not a plan. Not a
          schedule. One tiny, physical action.
        </p>
      </section>

      {/* task entry */}
      <section className="anim-fadeUp mt-10" style={{ animationDelay: "0.26s" }} aria-label="Task entry">
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="task-input" className="kicker mb-2.5 block">
            What are you stuck starting?
          </label>
          <div className={`flex flex-col gap-3 sm:flex-row ${err ? "shake" : ""}`}>
            <input
              id="task-input"
              ref={inputRef}
              type="text"
              className={`field flex-1 ${err ? "field-error" : ""}`}
              placeholder={`e.g. “${EXAMPLES[exIdx]}”`}
              value={task}
              maxLength={120}
              onChange={(e) => setTask(e.target.value)}
              autoComplete="off"
            />
            <Btn type="submit" variant="primary" size="lg" className="sm:w-36">
              START <Icon n="arrow" className="h-5 w-5" />
            </Btn>
          </div>
          {err && (
            <p className="mt-2 text-sm font-bold text-clay-300" role="alert">
              Give it a name — anything, even “the thing”.
            </p>
          )}
          <button
            type="button"
            onClick={oneTap}
            className="mt-3.5 inline-flex items-center gap-2 text-sm font-bold text-butter-300 transition-colors duration-200 hover:text-butter-400"
          >
            <Icon n="zap" className="h-4 w-4" />
            One-tap start — skip the questions, get the smallest step
          </button>
        </form>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-ink-mute">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip min-h-[32px] py-1 text-xs"
              onClick={() => {
                setTask(ex);
                inputRef.current?.focus();
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* secondary doors */}
      <section
        className="anim-fadeUp mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4"
        style={{ animationDelay: "0.34s" }}
        aria-label="Other ways in"
      >
        <button
          type="button"
          className="card group p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ember-400/60"
          onClick={() => dispatch({ type: "nav", screen: { id: "quick" } })}
        >
          <Icon n="clock" className="h-5 w-5 text-ember-400" />
          <p className="mt-2.5 font-display text-base font-bold text-ink">10-Second Start</p>
          <p className="mt-0.5 text-sm text-ink-mute">Break the seal. Nothing more.</p>
        </button>
        <button
          type="button"
          className="card group p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-mint-400/60"
          onClick={() => dispatch({ type: "nav", screen: { id: "shrinker" } })}
        >
          <Icon n="chevronsDown" className="h-5 w-5 text-mint-400" />
          <p className="mt-2.5 font-display text-base font-bold text-ink">Task Shrinker</p>
          <p className="mt-0.5 text-sm text-ink-mute">Big scary thing → tiny real action.</p>
        </button>
        <button
          type="button"
          className="card group p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-clay-400/60"
          onClick={() => dispatch({ type: "nav", screen: { id: "statecheck" } })}
        >
          <Icon n="heart" className="h-5 w-5 text-clay-400" />
          <p className="mt-2.5 font-display text-base font-bold text-ink">Why can't I start?</p>
          <p className="mt-0.5 text-sm text-ink-mute">Find the real blocker.</p>
        </button>
        <button
          type="button"
          className="card group p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-butter-400/60"
          onClick={() => {
            if (state.draft) dispatch({ type: "nav", screen: { id: "rescue" } });
            else {
              dispatch({ type: "toast", msg: "Name it above — we'll take it from there." });
              inputRef.current?.focus();
            }
          }}
        >
          <Icon n="lifebuoy" className="h-5 w-5 text-butter-400" />
          <p className="mt-2.5 font-display text-base font-bold text-ink">I'm stuck</p>
          <p className="mt-0.5 text-sm text-ink-mute">That's useful information.</p>
        </button>
      </section>

      {/* today strip */}
      <section className="anim-fadeUp mt-10" style={{ animationDelay: "0.42s" }} aria-label="Today">
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${startsToday > 0 ? "bg-mint-400" : "bg-pine-600"}`}
            style={startsToday > 0 ? { animation: "breathe 3s ease-in-out infinite" } : undefined}
          />
          {startsToday > 0 ? (
            <p className="font-bold text-mint-300">
              You started {startsToday} {startsToday === 1 ? "time" : "times"} today. Starting counts.
            </p>
          ) : (
            <p className="text-ink-mute">
              No starts yet today. That's okay — <em>one tiny step is plenty.</em>
            </p>
          )}
        </div>
      </section>

      {/* rotating microcopy */}
      <p key={mcIdx} className="anim-fadeIn mt-16 font-display text-xl font-semibold text-ink-dim sm:text-2xl">
        “{MICROCOPY[mcIdx]}”
      </p>
    </div>
  );
}
