/** Local smoke-test harness for the running Unstick dev server.
 * Sends a variety of tasks and prints the engine's chosen first step + next rungs.
 * Run with: npm run smoke
 */
import { analyzeTask } from "../src/engine/analysis.ts";
import { planFirstStep } from "../src/engine/engine.ts";
import { freshDraft } from "../src/engine/localEngine.ts";
import { nextStep, previewSteps } from "../src/engine/selector.ts";

const TASKS = [
  // English — digital
  "Reply to Alex's email about the project",
  "Write a blog article about AI safety",
  "Fix the bug in the checkout flow",
  "Organize my notes in Notion",
  // English — physical / mixed
  "Clean my entire apartment",
  "Declutter the garage and sell old stuff online",
  "Water the plants every other day",
  // English — vague / mental
  "Deal with that thing somehow",
  "Be more productive",
  // Arabic — digital
  "أرسل رسالة إلى أحمد عن الموعد",
  "أكتب تقرير عن المشروع",
  // Arabic — physical
  "نظف غرفتي",
  // Edge cases
  "Reply to John's email" + " and then",
  "Fix my code and also walk the dog",
];

function banner(t: string) {
  console.log("\n" + "─".repeat(64));
  console.log(`TASK: ${t}`);
}

function runOne(task: string) {
  banner(task);
  const a = analyzeTask(task);
  console.log(`  [analysis] medium=${a.medium} structure=${a.structure} locale=${a.locale} parts=${a.parts.length} complexity=${a.complexity} ambiguity=${a.ambiguity}`);
  let d: any = freshDraft(task);
  const plan = planFirstStep(a, {});
  console.log(`  [first step | ${plan.strategy} size=${plan.size}] ${plan.action}`);
  d = { ...d, ...plan, override: plan.action, strategy: plan.strategy, level: plan.size, memory: { ...d.memory, shown: [plan.action.toLowerCase()] } }; // quick memory seed
  // two followups with "stuck" feedback
  for (let i = 0; i < 2; i++) {
    const next = nextStep(d, null, { feedback: "stuck", avoidStrategy: d.strategy });
    console.log(`  [next  | ${next.strategy} size=${next.size}] ${next.action}`);
    d = { ...d, ...next, override: next.action, strategy: next.strategy, level: next.size, memory: next.memory, feedbacks: (d.feedbacks ?? 0) + 1, lastFeedback: "stuck" };
  }
  // show the rest of the ladder from the current rung
  const ladder = previewSteps(d, null, 3);
  console.log("  [ladder]");
  for (const r of ladder) console.log(`    size=${r.size} | ${r.action}`);
}

console.log("=== unstick smoke test (deterministic, offline engine) ===\n");
let failures = 0;
for (const t of TASKS) {
  try {
    runOne(t);
  } catch (e) {
    failures++;
    console.error(`  ❌ FAILED on: ${t}\n`, (e as Error).message);
  }
}
console.log(`\n=== ${TASKS.length - failures}/${TASKS.length} tasks rendered OK ===`);
process.exit(failures ? 1 : 0);
