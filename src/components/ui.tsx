import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useApp } from "../state/store";

/* ---------------- icons (inline SVG, stroke-based) ---------------- */

const PATHS: Record<string, ReactNode> = {
  spark: (
    <>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M5.9 5.9l12.2 12.2" />
      <path d="M18.1 5.9L5.9 18.1" />
    </>
  ),
  arrow: (
    <>
      <path d="M4.5 12h14" />
      <path d="M13 6.5l5.5 5.5-5.5 5.5" />
    </>
  ),
  play: <path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M9.2 5.5v13" strokeWidth="2.6" />
      <path d="M14.8 5.5v13" strokeWidth="2.6" />
    </>
  ),
  check: <path d="M4.5 12.8l4.8 4.7L19.5 6.5" />,
  x: (
    <>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </>
  ),
  chevronsDown: (
    <>
      <path d="M6.5 5.5l5.5 5.5 5.5-5.5" />
      <path d="M6.5 13l5.5 5.5L17.5 13" />
    </>
  ),
  next: (
    <>
      <path d="M6 5.5l6.5 6.5L6 18.5" />
      <path d="M12.5 5.5l6.5 6.5-6.5 6.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.3" />
      <path d="M12 7.6V12l3.1 2.1" />
    </>
  ),
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 3.6v5M12 15.4v5M3.6 12h5M15.4 12h5" />
    </>
  ),
  chart: (
    <>
      <path d="M5.5 19v-7" />
      <path d="M12 19V5.5" />
      <path d="M18.5 19v-10" />
      <path d="M3.5 19.5h17" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.9v2.8M12 18.3v2.8M2.9 12h2.8M18.3 12h2.8M5.4 5.4l2 2M16.6 16.6l2 2M18.6 5.4l-2 2M7.4 16.6l-2 2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11.2v4.6" />
      <path d="M12 8.1h.01" strokeWidth="2.6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M7 7l1 12.2h8L17 7" />
    </>
  ),
  wave: <path d="M3 12c2.4-4.2 4.8-4.2 7.2 0s4.8 4.2 7.2 0" />,
  shield: <path d="M12 3l7 2.8v6c0 4.6-3 7.6-7 9.2-4-1.6-7-4.6-7-9.2v-6z" />,
  zap: <path d="M13 3L5.5 13.5h5L10.8 21l7.7-10.5h-5.5z" />,
  minus: <path d="M6.5 12h11" />,
  plus: (
    <>
      <path d="M12 6.5v11" />
      <path d="M6.5 12h11" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c1.2-3.4 3.6-5 7-5s5.8 1.6 7 5" />
    </>
  ),
};

export function Icon({
  n,
  className = "h-5 w-5",
  sw = 1.8,
}: {
  n: keyof typeof PATHS | string;
  className?: string;
  sw?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[n] ?? null}
    </svg>
  );
}

/* ---------------- buttons ---------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "mint" | "ghost" | "quiet" | "clay";
  size?: "sm" | "lg";
};

export function Btn({ variant = "ghost", size, className = "", children, ...rest }: BtnProps) {
  const v = { primary: "btn-primary", mint: "btn-mint", ghost: "btn-ghost", quiet: "btn-quiet", clay: "btn-clay" }[
    variant
  ];
  const s = size === "lg" ? "btn-lg" : size === "sm" ? "btn-sm" : "";
  return (
    <button className={`btn ${v} ${s} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/* ---------------- toggle switch ---------------- */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors duration-200 ${
        on ? "border-ember-500 bg-ember-500" : "border-line bg-pine-800"
      }`}
    >
      <span
        className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full transition-all duration-200 ${
          on ? "left-[calc(100%-1.65rem)] bg-ember-950" : "left-1 bg-ink-mute"
        }`}
      />
    </button>
  );
}

/* ---------------- duration picker ---------------- */

const DURATIONS = [
  { l: "10 sec", s: 10 },
  { l: "1 min", s: 60 },
  { l: "5 min", s: 300 },
  { l: "10 min", s: 600 },
  { l: "15 min", s: 900 },
  { l: "25 min", s: 1500 },
];

export function DurationPicker({
  onGo,
  goLabel = "GO",
}: {
  onGo: (sec: number, bodyDouble: boolean) => void;
  goLabel?: string;
}) {
  const [sel, setSel] = useState(10);
  const [custom, setCustom] = useState(false);
  const [mins, setMins] = useState("");
  const [bd, setBd] = useState(false);

  const parsed = Math.min(Math.max(parseInt(mins, 10) || 1, 1), 180);
  const effSec = custom ? parsed * 60 : sel;
  const effLabel = custom ? `${parsed} min` : DURATIONS.find((d) => d.s === sel)?.l ?? "";

  return (
    <div className="card anim-pop space-y-4 p-5">
      <p className="text-lg font-bold text-ink">How long feels possible right now?</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Session length">
        {DURATIONS.map((d) => (
          <button
            key={d.s}
            type="button"
            className="chip"
            aria-pressed={!custom && sel === d.s}
            onClick={() => {
              setSel(d.s);
              setCustom(false);
            }}
          >
            {d.l}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={custom} onClick={() => setCustom(true)}>
          Custom
        </button>
      </div>
      {custom && (
        <label className="flex items-center gap-3 text-sm text-ink-dim">
          <span className="shrink-0">Minutes:</span>
          <input
            type="number"
            min={1}
            max={180}
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            className="field min-h-[42px] w-24 py-1 text-center"
            inputMode="numeric"
          />
        </label>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
        <div className="flex items-center gap-2.5">
          <Icon n="person" className="h-5 w-5 text-mint-400" />
          <span className="text-sm font-bold text-ink-dim">Body double — quiet company</span>
        </div>
        <Toggle on={bd} onChange={setBd} label="Body double mode" />
      </div>
      <Btn variant="primary" size="lg" className="w-full" onClick={() => onGo(effSec, bd)}>
        {goLabel} · {effLabel}
        <Icon n="play" className="h-4 w-4" />
      </Btn>
    </div>
  );
}

/* ---------------- toast + live region ---------------- */

export function Toast() {
  const { state } = useApp();
  if (!state.toast) return null;
  return (
    <div
      key={state.toast.id}
      role="status"
      className="anim-pop fixed bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
    >
      <div className="card flex items-center gap-3 border-mint-500/50 bg-pine-800 px-5 py-3.5 shadow-xl shadow-black/30">
        <Icon n="spark" className="h-4 w-4 shrink-0 text-mint-400" />
        <p className="text-sm font-bold text-ink">{state.toast.msg}</p>
      </div>
    </div>
  );
}

export function Live({ msg }: { msg: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {msg}
    </span>
  );
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
