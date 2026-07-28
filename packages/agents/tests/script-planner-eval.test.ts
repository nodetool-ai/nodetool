/**
 * Unit tests for the ScriptPlanner eval harness
 * (`src/evals/script-planner-*`): static script scoring, agent()-call
 * counting, metrics from the planner message stream, skip logic, and report
 * formatting — all with a scripted provider, no network.
 */
import { describe, it, expect } from "vitest";
import {
  runScriptPlannerEval,
  formatScriptPlanReport,
  checkScriptExpectations,
  countAgentCalls,
  SCRIPT_PLANNER_EVAL_CASES,
  type ScriptPlannerEvalCase
} from "../src/index.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";

/** Provider replaying one scripted tool-call list per generateLoop call. */
function createScriptedProvider(script: ToolCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc as unknown as ProviderStreamItem;
        await toolMap
          .get(tc.name)
          ?.execute?.(tc.args as Record<string, unknown>);
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const FANOUT_SCRIPT = `const pages = ["/pricing", "/security", "/about"];
const summaries = await parallel(pages.map((p) => () =>
  agent(\`Summarize \${p} in two sentences.\`, { label: p })));
return summaries.filter(Boolean);`;

const submitScript = (script: string): ToolCall =>
  ({
    id: "call_submit",
    name: "submit_script",
    args: { script }
  }) as unknown as ToolCall;

describe("countAgentCalls", () => {
  it("counts call sites and ignores property access", () => {
    expect(countAgentCalls("await agent('a'); await agent('b');")).toBe(2);
    expect(countAgentCalls("foo.agent(1); myagent(2);")).toBe(0);
  });
});

describe("checkScriptExpectations", () => {
  it("passes a concurrent fan-out script", () => {
    const checks = checkScriptExpectations(FANOUT_SCRIPT, {
      minAgentCalls: 1,
      requireConcurrency: true,
      maxChars: 2500
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails concurrency when independent work is serialized", () => {
    const serial = `const a = await agent("one");
const b = await agent("two");
return [a, b];`;
    const check = checkScriptExpectations(serial, {
      requireConcurrency: true
    }).find((c) => c.name === "concurrency");
    expect(check?.pass).toBe(false);
  });

  it("distinguishes a real loop from an unrolled one", () => {
    const unrolled = `const a = await agent("1"); const b = await agent("2"); return [a, b];`;
    const looped = `const out = [];
while (out.length < 10 && budget.remainingCalls() > 2) {
  out.push(await agent("find one more claim"));
}
return out;`;
    expect(
      checkScriptExpectations(unrolled, {
        requireLoop: true,
        requireBudgetGuard: true
      })
        .filter((c) => ["loop", "budget-guard"].includes(c.name))
        .every((c) => c.pass)
    ).toBe(false);
    expect(
      checkScriptExpectations(looped, {
        requireLoop: true,
        requireBudgetGuard: true
      })
        .filter((c) => ["loop", "budget-guard"].includes(c.name))
        .every((c) => c.pass)
    ).toBe(true);
  });

  it("flags a script that shadows a prelude name", () => {
    const shadowed = `const agent = async (p) => p;\nreturn await agent("x");`;
    const check = checkScriptExpectations(shadowed, {}).find(
      (c) => c.name === "no-shadowing"
    );
    expect(check?.pass).toBe(false);
    expect(check?.detail).toContain("agent");
  });

  it("flags module syntax and a script the host validator rejects", () => {
    const bad = `import fs from "node:fs";\nawait agent("x");`;
    const checks = checkScriptExpectations(bad, {});
    expect(checks.find((c) => c.name === "no-imports")?.pass).toBe(false);
    // No return statement → the host validator rejects it too.
    expect(checks.find((c) => c.name === "validates")?.pass).toBe(false);
  });
});

describe("runScriptPlannerEval", () => {
  const cases: ScriptPlannerEvalCase[] = [
    {
      id: "fan-out",
      description: "independent work fans out",
      objective: "Summarize three pages independently.",
      expect: { minAgentCalls: 1, requireConcurrency: true }
    },
    {
      id: "needs-models",
      description: "skipped without providers",
      objective: "Generate images.",
      needsModelProviders: true,
      expect: {}
    }
  ];

  it("collects metrics, scores the script, and skips model-dependent cases", async () => {
    const report = await runScriptPlannerEval({
      provider: createScriptedProvider([submitScript(FANOUT_SCRIPT)]),
      model: "test-model",
      cases
    });

    const fanout = report.cases[0];
    expect(fanout.accepted).toBe(true);
    expect(fanout.score).toBe(1);
    expect(fanout.agentCalls).toBe(1);
    expect(fanout.submitRounds).toBe(1);
    expect(fanout.validationFailures).toBe(0);
    expect(fanout.script).toContain("parallel(");

    expect(report.cases[1].skipped).toBe(true);
    expect(report.summary.successRate).toBe(1);
    expect(report.summary.oneShotRate).toBe(1);
  });

  it("counts a rejected submission and still accepts the fixed script", async () => {
    const report = await runScriptPlannerEval({
      // First submission never calls agent() → host validator rejects it.
      provider: createScriptedProvider([
        submitScript("return 42;"),
        submitScript(FANOUT_SCRIPT)
      ]),
      model: "test-model",
      cases: [cases[0]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].validationFailures).toBe(1);
    expect(report.cases[0].submitRounds).toBe(2);
    expect(report.summary.oneShotRate).toBe(0);
  });

  it("scores a run that never produced a valid script as failed", async () => {
    const report = await runScriptPlannerEval({
      provider: createScriptedProvider([submitScript("return 42;")]),
      model: "test-model",
      cases: [cases[0]]
    });
    expect(report.cases[0].accepted).toBe(false);
    expect(report.cases[0].score).toBe(0);
    expect(formatScriptPlanReport(report)).toContain("ScriptPlanner eval");
  });
});

describe("SCRIPT_PLANNER_EVAL_CASES", () => {
  it("has unique ids and an expectation on every case", () => {
    const ids = SCRIPT_PLANNER_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of SCRIPT_PLANNER_EVAL_CASES) {
      expect(Object.keys(c.expect).length).toBeGreaterThan(0);
      expect(c.objective.length).toBeGreaterThan(20);
    }
  });
});
