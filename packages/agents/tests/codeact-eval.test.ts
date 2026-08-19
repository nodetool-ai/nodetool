/**
 * CodeAct eval harness tests — scripted provider, no network. Proves the
 * cases are satisfiable and the scorer reads the right signals.
 */
import { describe, it, expect } from "vitest";
import {
  runCodeActEval,
  formatCodeActReport
} from "../src/evals/codeact-eval.js";
import { CODEACT_EVAL_CASES } from "../src/evals/codeact-cases.js";
import { createScriptedLoopProvider } from "./_helpers/scripted-loop-provider.js";

const SOLUTIONS: Record<string, string[]> = {
  "chain-in-one-action": [
    `import { calculate } from "@nodetool-ai/sandbox-nodetool/session";
     const a = await calculate({expression: "17 * 23"});
     const b = await calculate({expression: "441 / 21"});
     await finish({total: a.value + b.value});`
  ],
  "loop-over-dataset": [
    `import { list_cities, lookup_population } from "@nodetool-ai/sandbox-nodetool/session";
     const {cities} = await list_cities({});
     let total = 0;
     for (const city of cities) {
       const r = await lookup_population({city});
       total += r.population;
     }
     await finish({total});`
  ],
  "recover-from-failure": [
    `import { flaky_fetch } from "@nodetool-ai/sandbox-nodetool/session";
     let revision = null;
     for (let i = 0; i < 3 && !revision; i++) {
       try {
         revision = (await flaky_fetch({})).revision;
       } catch (e) { /* transient — retry */ }
     }
     await finish({revision});`
  ],
  "reduce-before-returning": [
    `import { list_cities, lookup_population } from "@nodetool-ai/sandbox-nodetool/session";
     const {cities} = await list_cities({});
     let best = 0;
     for (const city of cities) {
       const r = await lookup_population({city});
       if (r.population > best) best = r.population;
     }
     await finish({total: best});`
  ]
};

describe("codeact eval harness", () => {
  it("every case is satisfiable by a scripted run and scores 1.0", async () => {
    const provider = createScriptedLoopProvider(
      CODEACT_EVAL_CASES.map((c) => SOLUTIONS[c.id] ?? [])
    );

    const report = await runCodeActEval({
      provider,
      model: "scripted"
    });

    for (const result of report.cases) {
      expect(result.accepted, `${result.caseId}: ${JSON.stringify(result.checks)}`).toBe(true);
      expect(result.score).toBe(1);
    }
    expect(report.summary.successRate).toBe(1);
    expect(formatCodeActReport(report)).toContain("success 4/4");
  });

  it("scores a wrong result as a failed check", async () => {
    const provider = createScriptedLoopProvider([
      [`await finish({total: 1});`]
    ]);
    const report = await runCodeActEval({
      provider,
      model: "scripted",
      cases: [CODEACT_EVAL_CASES[0]]
    });
    const result = report.cases[0];
    expect(result.accepted).toBe(false);
    expect(result.checks.some((c) => !c.pass)).toBe(true);
  });
});
