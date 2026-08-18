import { useState, type ReactNode } from "react";
import { useApp } from "../state/store";
import { Btn, Icon, Toggle } from "../components/ui";
import { exportData } from "../lib/persist";
import type { Persisted } from "../engine/types";

export default function Settings() {
  const { state, dispatch } = useApp();
  const s = state.settings;
  const [confirming, setConfirming] = useState(false);

  function set(patch: Partial<typeof s>) {
    dispatch({ type: "settings", patch });
  }

  function onExport() {
    const data: Persisted = {
      v: 1,
      sessions: state.sessions,
      pending: state.draft,
      settings: state.settings,
      lastVisit: Date.now(),
    };
    exportData(data);
    dispatch({ type: "toast", msg: "Your data is downloading. It never left this device." });
  }

  const Row = ({
    title,
    desc,
    children,
  }: {
    title: string;
    desc: string;
    children: ReactNode;
  }) => (
    <div className="flex items-center justify-between gap-5 border-b border-dashed border-line py-5">
      <div>
        <p className="font-display text-base font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-mute">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <p className="kicker anim-fadeUp text-ember-400">settings</p>
      <h2 className="font-display anim-fadeUp mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        Make it yours.
      </h2>

      <section className="anim-fadeUp mt-8" style={{ animationDelay: "0.1s" }} aria-label="Appearance and behavior">
        <Row title="Text size" desc="Bigger words, less squinting.">
          <div className="flex gap-1.5" role="group" aria-label="Text size">
            {([100, 112, 125] as const).map((v, i) => (
              <button
                key={v}
                type="button"
                className="chip min-h-[38px] px-3.5"
                aria-pressed={s.textScale === v}
                onClick={() => set({ textScale: v })}
                style={{ fontSize: `${0.8 + i * 0.12}rem` }}
              >
                A
              </button>
            ))}
          </div>
        </Row>
        <Row title="Reduce motion" desc="Calms all animation down. Also follows your system setting.">
          <Toggle on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} label="Reduce motion" />
        </Row>
        <Row title="Gentle chime" desc="Two soft notes when a timer finishes. Nothing fireworks-shaped.">
          <Toggle on={s.sound} onChange={(v) => set({ sound: v })} label="Gentle chime" />
        </Row>
        <Row title="Body double messages" desc="The occasional “still here.” during company mode.">
          <Toggle on={s.doubleMsgs} onChange={(v) => set({ doubleMsgs: v })} label="Body double messages" />
        </Row>
        <Row title="Remember task names" desc="Off = session history stores no task text at all.">
          <Toggle on={s.saveTitles} onChange={(v) => set({ saveTitles: v })} label="Remember task names" />
        </Row>
      </section>

      <section className="anim-fadeUp mt-8" style={{ animationDelay: "0.18s" }} aria-label="AI provider">
        <h3 className="font-display text-lg font-bold text-ink">Task Initiation Engine</h3>
        <p className="mt-1 text-sm text-ink-mute">
          The built-in engine works offline, forever. Optionally point it at an AI endpoint — if it's unreachable,
          Unstick says “AI is taking a break” and quietly uses the built-in one. You never see a raw error.
        </p>
        <label htmlFor="ai-endpoint" className="kicker mt-4 block">
          AI endpoint (optional)
        </label>
        <input
          id="ai-endpoint"
          type="url"
          className="field mt-2"
          placeholder="https://your-engine.example/steps"
          value={s.aiEndpoint}
          onChange={(e) => set({ aiEndpoint: e.target.value })}
        />
      </section>

      <section className="anim-fadeUp mt-8" style={{ animationDelay: "0.26s" }} aria-label="Your data">
        <h3 className="font-display text-lg font-bold text-ink">Your data</h3>
        <p className="mt-1 text-sm text-ink-mute">
          Everything lives in this browser. No account, no cloud, no tracking. You can take it or torch it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Btn variant="ghost" onClick={onExport}>
            <Icon n="download" className="h-4 w-4" /> Export JSON
          </Btn>
          {!confirming ? (
            <Btn variant="clay" onClick={() => setConfirming(true)}>
              <Icon n="trash" className="h-4 w-4" /> Erase everything
            </Btn>
          ) : (
            <span className="card anim-pop flex flex-wrap items-center gap-2.5 border-clay-400/60 px-4 py-2">
              <span className="text-sm font-bold text-clay-300">
                Really erase {state.sessions.length} start{state.sessions.length === 1 ? "" : "s"} from this device?
              </span>
              <Btn
                variant="clay"
                size="sm"
                onClick={() => {
                  dispatch({ type: "clearData" });
                  dispatch({ type: "toast", msg: "All clear. Fresh page, no history." });
                  setConfirming(false);
                }}
              >
                Erase
              </Btn>
              <Btn variant="quiet" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Btn>
            </span>
          )}
        </div>
      </section>

      <p className="anim-fadeUp mt-10 text-xs text-ink-mute" style={{ animationDelay: "0.34s" }}>
        Unstick supports task initiation and everyday productivity. It is not a medical treatment or diagnostic tool.
      </p>
    </div>
  );
}
