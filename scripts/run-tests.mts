/**
 * Headless runner for the engine test suite + the real evaluation fixtures.
 *
 * The engine's pure suite lives in src/engine/localEngine.ts as
 * runEngineTests(). It is deterministic and dependency-free, but the
 * app only calls runEngineSelfTest() inside dev mode (console output).
 * This runner executes the same suite under vite-node so we can gate
 * every engine change on real, CI-able pass/fail numbers — and ALSO
 * drives data/evaluation_cases.jsonl, which needs node fs (so the
 * fixtures live here, not in the browser-bundled engine module).
 *
 * Usage: npm run test:engine
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runEngineTests, freshDraft, validLevel as validLevelLocal } from "../src/engine/localEngine.ts";
import { analyzeTask, tokenize } from "../src/engine/analysis.ts";
import { planFirstStep } from "../src/engine/engine.ts";
import { previewSteps, passesGuardrails } from "../src/engine/selector.ts";

type Case = { id: string; task?: string; expect?: Record<string, unknown> };

function loadCases(): Case[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..");
  const raw = readFileSync(join(repoRoot, "data", "evaluation_cases.jsonl"), "utf-8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function runEvalCases(): { pass: number; failures: Array<{ test: string; detail: string }> } {
  let pass = 0;
  const failures: Array<{ test: string; detail: string }> = [];
  const ok = (cond: boolean, test: string, detail: string) => {
    if (cond) pass++;
    else failures.push({ test, detail });
  };

  const cases = loadCases();
  ok(cases.length >= 10, "eval/fixtures-loaded", `${cases.length} cases`);

  for (const c of cases) {
    if (typeof c.task !== "string" || !c.task.trim()) continue;
    const a = analyzeTask(c.task);
    const expect = (c.expect ?? {}) as Record<string, unknown>;
    if (typeof expect.medium === "string") {
      ok(a.medium === expect.medium, `eval/${c.id}/medium`, `want ${expect.medium}, got ${a.medium}`);
    }
    if (typeof expect.structure === "string") {
      ok(a.structure === expect.structure, `eval/${c.id}/structure`, `want ${expect.structure}, got ${a.structure}`);
    }
    if (typeof expect.scopeStrengthMin === "number") {
      ok(a.scopeStrength >= (expect.scopeStrengthMin as number), `eval/${c.id}/scopeStrength`, String(a.scopeStrength));
    }
    if (typeof expect.complexityMin === "number") {
      ok(a.complexity >= (expect.complexityMin as number), `eval/${c.id}/complexity`, String(a.complexity));
    }
    if (typeof expect.ambiguityMin === "number") {
      ok(a.ambiguity >= (expect.ambiguityMin as number), `eval/${c.id}/ambiguity`, String(a.ambiguity));
    }
    if (typeof expect.actionCountMin === "number") {
      ok(a.actionCount >= (expect.actionCountMin as number), `eval/${c.id}/actionCount`, String(a.actionCount));
    }
    if (typeof expect.entityPreserved === "string") {
      ok(a.object.includes(expect.entityPreserved as string), `eval/${c.id}/entity`, a.object);
    }
    const plan = planFirstStep(a, {});
    ok(passesGuardrails(plan.action) && validLevelLocal(plan.size), `eval/${c.id}/plan`, plan.action);
    const ladder = previewSteps({ ...freshDraft(c.task), level: plan.size }, null, 4);
    for (const r of ladder) {
      if (Array.isArray(expect.mustStayAbout)) {
        const anchorSet = new Set((expect.mustStayAbout as string[]).map((w) => w.toLowerCase()));
        const hit = tokenize(r.action).some((w) => anchorSet.has(w.toLowerCase()));
        ok(hit, `eval/${c.id}/ladder-about`, r.action);
      }
    }
    if (Array.isArray(expect.rejectContains)) {
      const banned = expect.rejectContains as string[];
      const hay = [plan.action, ...ladder.map((r) => r.action)].join(" || ").toLowerCase();
      const leaks = banned.filter((b) => hay.includes(b.toLowerCase()));
      ok(leaks.length === 0, `eval/${c.id}/no-leak`, leaks.join(";"));
    }
  }
  return { pass, failures };
}

const suite = runEngineTests();
const evalr = runEvalCases();
const totalPass = suite.pass + evalr.pass;
const totalFail = suite.failures.length + evalr.failures.length;
const total = totalPass + totalFail;

console.log(`\n=== engine suite: ${suite.pass}/${suite.pass + suite.failures.length} passed ===`);
for (const f of suite.failures) console.error(`  · ${f.test}\n      ${f.detail}`);
console.log(`=== eval fixtures: ${evalr.pass}/${evalr.pass + evalr.failures.length} passed ===`);
for (const f of evalr.failures) console.error(`  · ${f.test}\n      ${f.detail}`);

console.log(`\n${totalFail === 0 ? "✅" : "❌"} unstick engine · ${totalPass}/${total} passed · ${totalFail} failed\n`);
process.exit(totalFail === 0 ? 0 : 1);
