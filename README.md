# Unstick Engine

> Offline, deterministic, local-first AI that breaks any task into the smallest
> possible next move — no internet, no API key, no black box.

Unstick is a task-initiation companion for people who know **what** to do but
can't **start** (or keep going). Give it a task in English or Arabic and it
reasons through a deterministic pipeline to suggest a first step so small you
can't reasonably refuse it.

Built for the desk you're already staring at — runs locally, stays local.

---

## Why "deterministic, not LLM"?

Unstick deliberately avoids guessing. Instead it runs a staged, testable pipeline:

```
understand  →  generate  →  size  →  score  →  guardrails  →  dedupe
   (analysis)  (templates)  (sizeFor) (weights)  (validateCandidate)
        ↘_______________________↘________________________________↙
                        adapt ◄── feedback ◄── rescue ◄── profile
```

- **No network calls by default.** Everything is rules + local state.
- **Fully reproducible.** The same input and history always yield the same
  first step — this is what makes it testable (324 assertions, 0 flaky tests).
- An optional remote AI **decoration layer** exists, but every suggestion it
  makes is passed through the same guardrails as local output.

## Quick start (one click, no installs beyond Node)

```bash
git clone https://github.com/drente748/unstick-engine.git
cd unstick-engine
npm install
npm run dev        # → http://localhost:3000
```

That's it. Open the URL and start typing a task.

### Useful scripts

| Script                | What it does |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Start the Vite dev server on `:3000`. |
| `npm run build`       | Production bundle (output in `dist/`). |
| `npm run typecheck`   | `tsc --noEmit` — type-check without emitting. |
| `npm run test:engine` | **Run the full test suite** (engine + evaluation fixtures). |
| `npm run smoke`       | Headless smoke test: feeds 14 representative tasks through the engine and prints every step + rationale. |

> **Tip:** `npm run test:engine` is the source of truth. The CI runs it on
> every push — if it's green, the engine's intelligence is locked in.

## Examples

| Task | First step it suggests |
| ---- | ---------------------- |
| Write a blog article about AI safety | Give yourself explicit permission to do the blog article AI safety badly for the next 90 seconds. |
| Clean my entire apartment | Set a 25-second timer for the entire apartment. When it ends, you're allowed to stop. That's the win. |
| Fix the bug in the checkout flow | Do the part of the bug a distracted version of you could still do. Just that. |

## Architecture at a glance

```
src/
├── engine/           # The brain — see below
│   ├── analysis.ts   # parse + classify: medium, structure, locale, ambiguity,
│   │                 # complexity, emotional friction, avoidance triggers,
│   │                 # multi-part decomposition (parts[])
│   ├── strategies.ts # per-strategy templates + structure-specific ladders
│   ├── selector.ts   # sizeFor · scoreCandidate · guardrails · dedupe ·
│   │                 # memory-based replay prevention (MEM_CAP=28)
│   ├── engine.ts     # planFirstStep · nextStep · adaptFromFeedback · rescue
│   ├── profile.ts    # local learning profile (bestSize, rates, momentum)
│   ├── decisionLog.ts# encrypted decision audit trail
│   └── localEngine.ts# facade + the full test suite (runEngineTests)
├── components/       # React UI
└── state/            # local-first state machine / store
```

### The understanding layer (`analysis.ts`)
- **Multi-lingual parsing** — English and Arabic (locale-aware).
- **Structure detection** — writing, communication, cleaning, learning, fixing, project, etc.
- **Medium inference** — digital, physical, mixed, unknown via verb/surface/tool signals.
- **Multi-part decomposition** — `parts[]` for compound tasks like
  "declutter the garage and sell old stuff online".
- **Barrier inference without guessing** — signals avoidance/overwhelm wording
  and raises the entry doorway accordingly.

### The generation layer (`strategies.ts`)
- Tagged templates per strategy (permission, tiny, physical, visual, question,
  timebox, decision, social, direct, decompose, information, rescue…).
- Structure-specific ladders so **learning/creating/writing tasks** never get a
  "stand up and walk" rung — they get "open and read one unit" instead.

### The selection layer (`selector.ts`)
- `sizeFor()` — picks an entry size from complexity × barrier × capacity ×
  feedback history, **inferring** from ambiguity/avoidance/friction when the
  user did not name a blocker.
- `scoreCandidate()` — weighted fit: structure, barrier, profile preference,
  history, confidence, novelty, **size-band match**, energy, minus effort/init.
- **Replay prevention** — never re-surfaces an action already shown this
  session (memory ring buffer, 28 entries).

## Testing

The engine ships **324 deterministic assertions** (252 from `runEngineTests` in
`src/engine/localEngine.ts`, plus 72 driven by the real fixtures in
`data/evaluation_cases.jsonl`).

```bash
npm run test:engine
# ✅ unstick engine · 324/324 passed · 0 failed
```

The fixtures cover multilingual tasks, compound tasks, entity preservation
("John's", "José"), scope strength, ambiguity thresholds, ladder
coherence, and banned-phrase rejection.

## Local-first & privacy

- All state is kept in `localStorage`.
- Task text is **never** stored or transmitted — it is hashed (FNV-1a) for
  similarity checks and discarded.
- No analytics, no telemetry, no account required.

## License

MIT — see [LICENSE](LICENSE).
