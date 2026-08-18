import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { Btn, Icon, Live, formatClock } from "../components/ui";
import { currentAction } from "../engine/localEngine";
import { chime } from "../lib/persist";

const DOUBLE_MSGS = ["Still here.", "One thing at a time.", "You're doing it.", "Keep going.", "No rush — just this."];

const R = 86;
const C = 2 * Math.PI * R;

export default function Focus() {
  const { state, dispatch } = useApp();
  const screen = state.screen.id === "focus" ? state.screen : null;
  const draft = state.draft;

  const [remaining, setRemaining] = useState(screen?.durationSec ?? 10);
  const [live, setLive] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgOn, setMsgOn] = useState(false);
  const endedRef = useRef(false);
  const paused = state.paused;
  const soundOn = state.settings.sound;
  const bodyDouble = !!screen?.bodyDouble && state.settings.doubleMsgs;

  /* countdown */
  useEffect(() => {
    if (!screen || paused) return;
    const iv = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [paused, screen]);

  /* completion */
  useEffect(() => {
    if (remaining === 0 && screen && !endedRef.current) {
      endedRef.current = true;
      if (soundOn) chime();
      dispatch({ type: "endSession" });
    }
  }, [remaining, screen, dispatch, soundOn]);

  /* minute announcements */
  useEffect(() => {
    if (remaining > 0 && remaining <= 180 && remaining % 60 === 0) {
      setLive(`${remaining / 60} minute${remaining === 60 ? "" : "s"} left.`);
    }
  }, [remaining]);

  /* body double presence */
  useEffect(() => {
    if (!bodyDouble) return;
    const first = setTimeout(() => setMsgOn(true), 9000);
    const iv = setInterval(() => setMsgIdx((i) => (i + 1) % DOUBLE_MSGS.length), 36000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [bodyDouble]);

  /* keyboard: n next · p pause · d done · s stuck */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") dispatch({ type: "next" });
      if (k === "p") dispatch({ type: "pause", value: !paused });
      if (k === "d") dispatch({ type: "endSession" });
      if (k === "s") dispatch({ type: "nav", screen: { id: "rescue" } });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, paused]);

  if (!draft || !screen) return null;

  const action = currentAction(draft.domain, draft.level, draft.stepIndex, draft.override, draft.ladderOverride);
  const total = Math.max(screen.durationSec, 1);
  const frac = remaining / total;
  const dashOffset = C * (1 - frac);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-5 pb-10 pt-8 sm:pt-12">
      <Live msg={live} />

      {/* top bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 rounded-full bg-mint-400"
            style={{ animation: paused ? undefined : "breathe 2.4s ease-in-out infinite" }}
          />
          <p className="font-display text-lg font-bold text-mint-300">You're moving.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip min-h-[30px] cursor-default py-1 text-xs">
            step {draft.stepIndex + 1} · {draft.stepsDone} done
          </span>
          <Btn variant="quiet" size="sm" onClick={() => dispatch({ type: "pause", value: true })} aria-label="Pause session">
            <Icon n="pause" className="h-4 w-4" />
          </Btn>
        </div>
      </div>

      {/* body double presence */}
      {bodyDouble && (
        <div className="anim-fadeIn mt-5 flex items-center gap-3 text-ink-mute">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-mint-400"
            style={{ animation: "breathe 4s ease-in-out infinite" }}
          />
          <p key={msgIdx} className="anim-fadeIn text-sm font-bold italic">
            {msgOn ? DOUBLE_MSGS[msgIdx] : "You're not alone. Let's work."}
          </p>
        </div>
      )}

      {/* the one action */}
      <div className="mt-9">
        <p className="kicker">Your next tiny action</p>
        <p
          key={`${action}-${draft.stepIndex}`}
          className="font-display anim-pop mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-[2.6rem]"
        >
          {action}
        </p>
        <p className="mt-3 text-sm text-ink-mute">
          Only this. The rest of “{draft.title}” doesn't exist right now.
        </p>
      </div>

      {/* timer */}
      <div className="relative mx-auto mt-9 h-[212px] w-[212px]">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--color-pine-700)" strokeWidth="9" />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={remaining <= 3 ? "var(--color-butter-400)" : "var(--color-mint-400)"}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`timer-font text-[3.1rem] font-bold leading-none ${paused ? "text-ink-mute" : "text-ink"}`}>
            {formatClock(remaining)}
          </span>
          <span className="kicker mt-2 text-[9px]">{paused ? "paused" : "remaining"}</span>
        </div>
      </div>

      {/* controls */}
      <div className="mt-9 grid grid-cols-3 gap-2.5">
        <Btn variant="ghost" onClick={() => dispatch({ type: "next" })} title="Next tiny step (n)">
          <Icon n="next" className="h-4 w-4" /> NEXT
        </Btn>
        <Btn variant="quiet" onClick={() => dispatch({ type: "pause", value: !paused })} title="Pause (p)">
          <Icon n={paused ? "play" : "pause"} className="h-4 w-4" /> {paused ? "RESUME" : "PAUSE"}
        </Btn>
        <Btn variant="mint" onClick={() => dispatch({ type: "endSession" })} title="Done (d)">
          <Icon n="check" className="h-4 w-4" /> DONE
        </Btn>
      </div>
      <Btn variant="clay" size="lg" className="mt-3 w-full" onClick={() => dispatch({ type: "nav", screen: { id: "rescue" } })}>
        <Icon n="lifebuoy" className="h-5 w-5" /> I'M STUCK
      </Btn>
      <p className="mt-3 text-center text-xs text-ink-mute">
        Keys: <span className="timer-font">n</span> next · <span className="timer-font">p</span> pause ·{" "}
        <span className="timer-font">d</span> done · <span className="timer-font">s</span> stuck — stopping early is
        always allowed.
      </p>

      {/* pause overlay */}
      {paused && (
        <div className="anim-fadeIn fixed inset-0 z-[60] flex items-center justify-center bg-pine-950/88 px-5 backdrop-blur-sm">
          <div className="card anim-pop w-full max-w-sm p-7 text-center">
            <p className="font-display text-3xl font-extrabold text-ink">Paused.</p>
            <p className="mt-2 text-ink-dim">The task isn't going anywhere. Neither are we.</p>
            <div className="mt-6 space-y-2.5">
              <Btn variant="primary" className="w-full" onClick={() => dispatch({ type: "pause", value: false })}>
                <Icon n="play" className="h-4 w-4" /> RESUME
              </Btn>
              <Btn variant="clay" className="w-full" onClick={() => dispatch({ type: "nav", screen: { id: "rescue" } })}>
                <Icon n="lifebuoy" className="h-4 w-4" /> I'M STUCK
              </Btn>
              <Btn variant="quiet" className="w-full" onClick={() => dispatch({ type: "endSession" })}>
                END — you still started
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
