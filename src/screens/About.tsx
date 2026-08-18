import { useApp } from "../state/store";
import { Icon } from "../components/ui";

const LOOP = [
  { icon: "wave", text: "You're stuck. That's the starting line, not a verdict.", tone: "text-clay-300" },
  { icon: "spark", text: "Name the thing — one line, no detail.", tone: "text-butter-300" },
  { icon: "chevronsDown", text: "Shrink it until it's a physical move: open it, touch it, stand up.", tone: "text-mint-400" },
  { icon: "play", text: "Start for 10 seconds. Stopping after is allowed and still counts.", tone: "text-ember-400" },
  { icon: "zap", text: "Momentum shows up more often than motivation does.", tone: "text-mint-400" },
  { icon: "lifebuoy", text: "Stuck again? Rescue mode shrinks it further. Loop, don't spiral.", tone: "text-butter-300" },
];

const KEYS: Array<[string, string]> = [
  ["Enter", "submit / start"],
  ["1 – 4", "how hard does starting feel"],
  ["N", "next tiny step"],
  ["P", "pause / resume"],
  ["D", "done — wrap the session"],
  ["S", "I'm stuck — rescue mode"],
  ["Esc", "pause (in focus) / go home"],
];

export default function About() {
  const { dispatch } = useApp();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <p className="kicker anim-fadeUp text-mint-400">about unstick</p>
      <h2 className="font-display anim-fadeUp mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        Not another to-do list.
      </h2>
      <p className="anim-fadeUp mt-5 text-lg leading-relaxed text-ink-dim" style={{ animationDelay: "0.08s" }}>
        Unstick doesn't help you manage more tasks. It helps you{" "}
        <strong className="text-ink">start the one you're avoiding right now</strong>. No projects, no due dates, no
        streaks — just the distance between “I should” and a moving hand, made as short as possible.
      </p>

      {/* the loop */}
      <section className="anim-fadeUp mt-10" style={{ animationDelay: "0.14s" }} aria-label="How it works">
        <h3 className="font-display text-lg font-bold text-ink">The loop</h3>
        <ol className="mt-4 space-y-0">
          {LOOP.map((l, i) => (
            <li key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-pine-850 ${l.tone}`}>
                  <Icon n={l.icon} className="h-4 w-4" />
                </span>
                {i < LOOP.length - 1 && <span className="w-px flex-1 bg-line" aria-hidden="true" />}
              </div>
              <p className="pb-6 pt-1.5 font-bold text-ink-dim">{l.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* safety */}
      <section className="card anim-fadeUp mt-4 border-butter-400/40 p-6" style={{ animationDelay: "0.2s" }} aria-label="Safety">
        <div className="flex items-center gap-2.5">
          <Icon n="shield" className="h-5 w-5 text-butter-400" />
          <h3 className="font-display text-lg font-bold text-ink">The honest bit</h3>
        </div>
        <p className="mt-3 leading-relaxed text-ink-dim">
          Unstick is designed to support task initiation and everyday productivity. It is{" "}
          <strong className="text-ink">not a medical treatment or diagnostic tool</strong>, it doesn't diagnose or cure
          ADHD, and it doesn't replace care from a qualified professional. If starting feels impossible most days,
          that's worth a real conversation with one — this app will still be here, doing the small stuff, when you get
          back.
        </p>
      </section>

      {/* privacy */}
      <section className="card anim-fadeUp mt-5 p-6" style={{ animationDelay: "0.26s" }} aria-label="Privacy">
        <div className="flex items-center gap-2.5">
          <Icon n="info" className="h-5 w-5 text-mint-400" />
          <h3 className="font-display text-lg font-bold text-ink">Local-first, on purpose</h3>
        </div>
        <ul className="mt-3 space-y-1.5 leading-relaxed text-ink-dim">
          <li>· Everything is stored in your browser. No account, no cloud, no analytics.</li>
          <li>· Turn off “remember task names” and history stores zero task text.</li>
          <li>· Export or erase your data any time from Settings.</li>
          <li>· The AI engine is optional — the built-in one never phones home.</li>
        </ul>
      </section>

      {/* keys */}
      <section className="anim-fadeUp mt-9" style={{ animationDelay: "0.32s" }} aria-label="Keyboard shortcuts">
        <h3 className="font-display text-lg font-bold text-ink">Keyboard-friendly</h3>
        <p className="mt-1 text-sm text-ink-mute">The whole core loop works without a mouse.</p>
        <dl className="mt-4 space-y-2">
          {KEYS.map(([k, d]) => (
            <div key={k} className="flex items-center gap-4">
              <dt>
                <kbd className="timer-font rounded-lg border border-line bg-pine-850 px-2.5 py-1 text-xs font-bold text-butter-300">
                  {k}
                </kbd>
              </dt>
              <dd className="text-sm font-bold text-ink-dim">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="anim-fadeUp mt-10 text-sm italic text-ink-mute" style={{ animationDelay: "0.38s" }}>
        Made for real brains — especially the fast, bored, brilliant, stuck ones.{" "}
        <button
          type="button"
          className="linkline not-italic"
          onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
        >
          Ready for one tiny step? →
        </button>
      </p>
    </div>
  );
}
