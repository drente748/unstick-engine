import { useMemo, type CSSProperties } from "react";
import { useApp } from "../state/store";
import type { ThemeId } from "../engine/types";

interface Mote {
  left: number;
  top: number;
  size: number;
  dur: number;
  delay: number;
  o: number;
  warm: boolean;
}

interface Palette {
  base: string;
  glowA: string;
  glowB: string;
  glowC: string;
  warmMote: string;
  coolMote: string;
}

const PALETTES: Record<ThemeId, Palette> = {
  pine: {
    base: "radial-gradient(130% 90% at 50% -10%, #16261e 0%, #0f1a15 52%, #0a110e 100%)",
    glowA: "radial-gradient(52rem 36rem at 12% 108%, rgba(255,138,69,0.10) 0%, rgba(255,138,69,0) 62%)",
    glowB: "radial-gradient(46rem 32rem at 92% -6%, rgba(127,217,177,0.08) 0%, rgba(127,217,177,0) 60%)",
    glowC: "radial-gradient(30rem 22rem at 78% 82%, rgba(255,217,138,0.05) 0%, rgba(255,217,138,0) 65%)",
    warmMote: "rgba(255,199,158,0.85)",
    coolMote: "rgba(169,233,204,0.7)",
  },
  dawn: {
    base: "radial-gradient(130% 90% at 50% -10%, #f7f8f1 0%, #eef1e8 55%, #e4e9da 100%)",
    glowA: "radial-gradient(52rem 36rem at 12% 108%, rgba(239,124,38,0.09) 0%, rgba(239,124,38,0) 62%)",
    glowB: "radial-gradient(46rem 32rem at 92% -6%, rgba(46,157,109,0.10) 0%, rgba(46,157,109,0) 60%)",
    glowC: "radial-gradient(30rem 22rem at 78% 82%, rgba(217,164,55,0.08) 0%, rgba(217,164,55,0) 65%)",
    warmMote: "rgba(176,79,14,0.4)",
    coolMote: "rgba(58,110,84,0.4)",
  },
  rain: {
    base: "radial-gradient(130% 90% at 50% -10%, #141c26 0%, #0f151d 52%, #0a0e14 100%)",
    glowA: "radial-gradient(52rem 36rem at 12% 108%, rgba(255,170,110,0.08) 0%, rgba(255,170,110,0) 62%)",
    glowB: "radial-gradient(46rem 32rem at 92% -6%, rgba(99,196,180,0.10) 0%, rgba(99,196,180,0) 60%)",
    glowC: "radial-gradient(30rem 22rem at 78% 82%, rgba(140,170,205,0.06) 0%, rgba(140,170,205,0) 65%)",
    warmMote: "rgba(255,196,150,0.6)",
    coolMote: "rgba(154,223,210,0.55)",
  },
};

/** Ambient layered background: tinted base, two breathing glows, drifting motes. */
export default function Background() {
  const { state } = useApp();
  const pal = PALETTES[state.settings.theme] ?? PALETTES.pine;

  const motes = useMemo<Mote[]>(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: (i * 61.8) % 100,
        top: 40 + ((i * 37.7) % 58),
        size: 2 + ((i * 7) % 4),
        dur: 20 + ((i * 13) % 24),
        delay: -((i * 5.3) % 22),
        o: 0.16 + ((i * 11) % 30) / 100,
        warm: i % 3 === 0,
      })),
    [],
  );

  return (
    <>
      <div
        key={state.settings.theme}
        className="anim-fadeIn pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute inset-0" style={{ background: pal.base }} />
        <div className="absolute inset-0" style={{ background: pal.glowA, animation: "glowPulse 9s ease-in-out infinite" }} />
        <div
          className="absolute inset-0"
          style={{ background: pal.glowB, animation: "glowPulse 12s 2s ease-in-out infinite" }}
        />
        <div className="absolute inset-0" style={{ background: pal.glowC }} />
        {motes.map((m, i) => (
          <span
            key={i}
            className="mote"
            style={
              {
                left: `${m.left}%`,
                top: `${m.top}%`,
                width: `${m.size}px`,
                height: `${m.size}px`,
                background: m.warm ? pal.warmMote : pal.coolMote,
                animationDuration: `${m.dur}s`,
                animationDelay: `${m.delay}s`,
                "--mo": m.o,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
