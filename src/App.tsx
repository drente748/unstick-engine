import { useEffect } from "react";
import { AppProvider, useApp } from "./state/store";
import Background from "./components/Background";
import { Icon, Toast } from "./components/ui";
import Home from "./screens/Home";
import Threshold from "./screens/Threshold";
import Micro from "./screens/Micro";
import Quick from "./screens/Quick";
import Shrinker from "./screens/Shrinker";
import Focus from "./screens/Focus";
import Rescue, { Reset } from "./screens/Rescue";
import Complete from "./screens/Complete";
import Overwhelm from "./screens/Overwhelm";
import Progress from "./screens/Progress";
import Settings from "./screens/Settings";
import About from "./screens/About";

const NAV: Array<{ id: "progress" | "settings" | "about"; label: string }> = [
  { id: "progress", label: "Progress" },
  { id: "settings", label: "Settings" },
  { id: "about", label: "About" },
];

const FOOTER_SCREENS = new Set(["home", "progress", "settings", "about"]);

function Header() {
  const { state, dispatch } = useApp();
  const scr = state.screen;
  return (
    <header className="sticky top-0 z-50 border-b border-line-soft bg-pine-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-5">
        <button
          type="button"
          className="group flex items-center gap-2"
          onClick={() => dispatch({ type: "nav", screen: { id: "home" } })}
          aria-label="Unstick — home"
        >
          <Icon n="spark" className="h-5 w-5 text-ember-400 transition-transform duration-500 group-hover:rotate-90" sw={2.4} />
          <span className="font-display text-xl font-extrabold tracking-tight text-ink">
            unstick<span className="text-ember-400">.</span>
          </span>
        </button>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Main">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => dispatch({ type: "nav", screen: { id: n.id } })}
              aria-current={scr.id === n.id ? "page" : undefined}
              className={`rounded-lg px-2.5 py-2 text-xs font-bold transition-colors sm:px-3 sm:text-sm ${
                scr.id === n.id ? "bg-pine-800 text-ember-300" : "text-ink-mute hover:text-ink"
              }`}
            >
              {n.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => dispatch({ type: "nav", screen: { id: "overwhelm" } })}
            className="ml-1 rounded-full border border-butter-400/50 px-3 py-2 text-xs font-bold text-butter-300 transition-all duration-200 hover:-translate-y-px hover:bg-butter-400/10 sm:px-4"
          >
            I'm overwhelmed
          </button>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { dispatch } = useApp();
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        <p className="font-display text-base font-bold text-ink-dim">
          Unstick helps you start — it doesn't manage your tasks, and it doesn't want to.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-mute">
          <span>local-first · no account · no tracking</span>
          <button type="button" className="linkline" onClick={() => dispatch({ type: "nav", screen: { id: "about" } })}>
            About & safety
          </button>
          <span className="max-w-md">
            Supports task initiation and everyday productivity. Not a medical treatment or diagnostic tool.
          </span>
        </div>
      </div>
    </footer>
  );
}

function Shell() {
  const { state, dispatch } = useApp();
  const scr = state.screen;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (scr.id === "home") return;
      if (scr.id === "focus") dispatch({ type: "pause", value: true });
      else dispatch({ type: "nav", screen: { id: "home" } });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scr.id, dispatch]);

  const immersive = scr.id === "focus" || scr.id === "reset" || scr.id === "micro";
  const key =
    scr.id === "focus"
      ? `focus-${scr.durationSec}-${String(scr.bodyDouble)}-${state.draft?.sessionId ?? "x"}`
      : scr.id;

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      {!immersive && scr.id !== "overwhelm" && <Header />}
      <main id="main" className="flex-1">
        {scr.id !== "overwhelm" && (
          <div key={key} className={immersive ? undefined : "screen-in"}>
            {scr.id === "home" && <Home />}
            {scr.id === "threshold" && <Threshold />}
            {scr.id === "micro" && <Micro />}
            {scr.id === "quick" && <Quick />}
            {scr.id === "shrinker" && <Shrinker />}
            {scr.id === "focus" && <Focus />}
            {scr.id === "rescue" && <Rescue />}
            {scr.id === "reset" && <Reset />}
            {scr.id === "complete" && <Complete />}
            {scr.id === "progress" && <Progress />}
            {scr.id === "settings" && <Settings />}
            {scr.id === "about" && <About />}
          </div>
        )}
      </main>
      {scr.id === "overwhelm" && <Overwhelm />}
      {FOOTER_SCREENS.has(scr.id) && <Footer />}
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Background />
      <Shell />
    </AppProvider>
  );
}
