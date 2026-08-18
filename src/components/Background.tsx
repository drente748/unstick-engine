import { useMemo, type CSSProperties } from "react";

interface Mote {
  left: number;
  top: number;
  size: number;
  dur: number;
  delay: number;
  o: number;
  warm: boolean;
}

/** Ambient layered background: deep pine base, two soft glows, drifting motes. */
export default function Background() {
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
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(130% 90% at 50% -10%, #16261e 0%, #0f1a15 52%, #0a110e 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(52rem 36rem at 12% 108%, rgba(255,138,69,0.10) 0%, rgba(255,138,69,0) 62%)",
            animation: "glowPulse 9s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(46rem 32rem at 92% -6%, rgba(127,217,177,0.08) 0%, rgba(127,217,177,0) 60%)",
            animation: "glowPulse 12s 2s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(30rem 22rem at 78% 82%, rgba(255,217,138,0.05) 0%, rgba(255,217,138,0) 65%)",
          }}
        />
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
                background: m.warm ? "rgba(255,199,158,0.85)" : "rgba(169,233,204,0.7)",
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
