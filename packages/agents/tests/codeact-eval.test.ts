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
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";

/** Provider that answers every case with a scripted list of code actions. */
function createScriptedLoopProvider(
  actionsByCall: string[][]
): BaseProvider {
  let call = 0;
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const actions = actionsByCall[call++] ?? [];
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let idx = 0;
      for (const code of actions) {
        if (args.signal?.aborted) break;
        const tc: ToolCall = {
          id: `tc_${call}_${idx++}`,
          name: "execute_code",
          args: { code }
        };
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute ? await tool.execute(tc.args) : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const SOLUTIONS: Record<string, string[]> = {
  "chain-in-one-action": [
    `const a = await tools.calculate({expression: "17 * 23"});
     const b = await tools.calculate({expression: "441 / 21"});
     await finish({total: a.value + b.value});`
  ],
  "loop-over-dataset": [
    `const {cities} = await tools.list_cities({});
     let total = 0;
     for (const city of cities) {
       const r = await tools.lookup_population({city});
       total += r.population;
     }
     await finish({total});`
  ],
  "recover-from-failure": [
    `let revision = null;
     for (let i = 0; i < 3 && !revision; i++) {
       try {
         revision = (await tools.flaky_fetch({})).revision;
       } catch (e) { /* transient — retry */ }
     }
     await finish({revision});`
  ],
  "reduce-before-returning": [
    `const {cities} = await tools.list_cities({});
     let best = 0;
     for (const city of cities) {
       const r = await tools.lookup_population({city});
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
