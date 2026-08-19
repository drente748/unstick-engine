import { useApp } from "../state/store";
import { Btn, Icon } from "../components/ui";
import { BLOCKER_LABEL, LEVEL_LABELS, STRATEGY_LABEL, durationLabel } from "../engine/localEngine";

function lastNDays(n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

export default function Progress() {
  const { state, dispatch, profile } = useApp();
  const s = state.sessions;

  const todayStr = new Date().toDateString();
  const startsToday = s.filter((x) => new Date(x.startedAt).toDateString() === todayStr).length;
  const steps = s.reduce((a, x) => a + x.steps, 0);
  const seconds = s.reduce((a, x) => a + x.seconds, 0);
  const rescues = s.reduce((a, x) => a + x.rescues, 0);
  const finished = s.filter((x) => x.endedAt !== null).length;

  const week = lastNDays(7).map((day) => ({
    key: day.toDateString(),
    label: day.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
    count: s.filter((x) => new Date(x.startedAt).toDateString() === day.toDateString()).length,
  }));
  const weekTotal = week.reduce((a, d) => a + d.count, 0);
  const max = Math.max(...week.map((d) => d.count), 1);

  const insight =
    rescues > 0
      ? `${rescues} comeback${rescues === 1 ? "" : "s"} so far. Getting stuck and returning is the skill — not the failure.`
      : steps >= 10
        ? `${steps} tiny steps don't look like much from here. They compound anyway.`
        : startsToday > 0
          ? "You started today. That's the entire game."
          : "The only number that matters in here: starts.";

  if (s.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 pt-20 text-center">
        <p className="kicker anim-fadeUp text-mint-400">progress, redefined</p>
        <h2 className="font-display anim-pop mt-4 text-4xl font-extrabold text-ink sm:text-5xl">Nothing here yet.</h2>
        <p className="anim-fadeUp mt-4 text-lg text-ink-dim">
          What's one thing you'd like to start? One start is enough to put something on this page.
        </p>
        <Btn variant="primary" size="lg" className="anim-fadeUp mt-8" onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}>
          Start something tiny <Icon n="arrow" className="h-4 w-4" />
        </Btn>
      </div>
    );
  }

  const mins = Math.round(seconds / 60);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <p className="kicker anim-fadeUp text-mint-400">progress, redefined</p>
      <h2 className="font-display anim-fadeUp mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        Starting counts.
      </h2>

      {/* hero stat */}
      <div className="anim-fadeUp mt-8 flex items-end gap-4" style={{ animationDelay: "0.1s" }}>
        <span className="font-display text-[5.5rem] font-extrabold leading-none text-mint-300 sm:text-[7rem]">
          {startsToday}
        </span>
        <p className="pb-3 text-lg font-bold text-ink-dim">
          start{startsToday === 1 ? "" : "s"} today
          <span className="block text-sm font-normal text-ink-mute">however small. all of them count.</span>
        </p>
      </div>

      {/* week bars */}
      <section className="card anim-fadeUp mt-9 p-5 sm:p-6" style={{ animationDelay: "0.18s" }} aria-label="Starts over the last 7 days">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink">Last 7 days</p>
          <p className="text-sm font-bold text-ink-mute">
            {weekTotal} start{weekTotal === 1 ? "" : "s"} · zero pressure
          </p>
        </div>
        <div className="mt-5 flex h-28 items-end gap-2 sm:gap-3">
          {week.map((d) => (
            <div
              key={d.key}
              className="flex flex-1 flex-col items-center gap-2"
              role="img"
              aria-label={`${d.label}: ${d.count} start${d.count === 1 ? "" : "s"}`}
            >
              <span className="timer-font text-xs font-bold text-ink-dim">{d.count > 0 ? d.count : ""}</span>
              <div
                className={`w-full rounded-t-md transition-all duration-500 ${
                  d.key === todayStr ? "bg-butter-400" : d.count > 0 ? "bg-mint-500/80" : "bg-pine-700"
                }`}
                style={{ height: d.count > 0 ? `${Math.max((d.count / max) * 100, 12)}%` : "4px" }}
              />
              <span className={`text-[11px] font-bold ${d.key === todayStr ? "text-butter-300" : "text-ink-mute"}`}>
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* start profile */}
      <section
        className="card anim-fadeUp mt-5 p-5 sm:p-6"
        style={{ animationDelay: "0.22s" }}
        aria-label="Your start profile"
      >
        <div className="flex items-center gap-2.5">
          <Icon n="spark" className="h-5 w-5 text-ember-400" />
          <p className="font-display text-lg font-bold text-ink">Your start profile</p>
        </div>
        {profile.confidence === "none" ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-dim">
            Still learning. After a few sessions, Unstick notices which step sizes, lengths and rescue moves actually
            get <em>you</em> moving — then it pre-sizes everything to fit.
          </p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {profile.bestLevel != null && (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold text-ink-mute">You start best from</span>
                <span className="font-display text-base font-bold text-mint-300">
                  {LEVEL_LABELS[profile.bestLevel]} steps
                </span>
              </p>
            )}
            {profile.bestDuration != null && (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold text-ink-mute">Your momentum length</span>
                <span className="font-display text-base font-bold text-butter-300">
                  {durationLabel(profile.bestDuration)}
                </span>
              </p>
            )}
            {profile.bestStrategy && (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold text-ink-mute">When stuck, this works for you</span>
                <span className="font-display text-base font-bold text-clay-300">
                  {STRATEGY_LABEL[profile.bestStrategy]}
                </span>
              </p>
            )}
            {profile.commonBlocker && (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold text-ink-mute">Your usual blocker</span>
                <span className="font-display text-base font-bold text-ink">{BLOCKER_LABEL[profile.commonBlocker]}</span>
              </p>
            )}
            <p className="pt-2 text-xs text-ink-mute">
              Learned locally from {profile.starts} start{profile.starts === 1 ? "" : "s"}. Nothing leaves this device.
            </p>
          </div>
        )}
      </section>

      {/* ledger */}
      <section className="anim-fadeUp mt-8" style={{ animationDelay: "0.26s" }} aria-label="All-time numbers">
        {[
          { label: "Tiny steps taken", value: steps, icon: "check", tone: "text-mint-400" },
          { label: "Time in motion", value: mins > 0 ? `${mins} min` : `${seconds}s`, icon: "clock", tone: "text-butter-400" },
          { label: "Comebacks (rescues)", value: rescues, icon: "lifebuoy", tone: "text-clay-300" },
          { label: "Sessions wrapped up", value: finished, icon: "zap", tone: "text-ember-400" },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 border-b border-dashed border-line py-3.5 transition-colors hover:border-pine-600"
          >
            <Icon n={row.icon} className={`h-5 w-5 shrink-0 ${row.tone}`} />
            <span className="font-bold text-ink-dim">{row.label}</span>
            <span className="mx-1 flex-1 border-b border-dotted border-line" aria-hidden="true" />
            <span className="timer-font text-lg font-bold text-ink">{row.value}</span>
          </div>
        ))}
      </section>

      <p className="anim-fadeUp mt-8 text-sm text-ink-mute" style={{ animationDelay: "0.34s" }}>
        No streaks. No shame. You can't fall behind in here — {insight.toLowerCase()}
      </p>
    </div>
  );
}
