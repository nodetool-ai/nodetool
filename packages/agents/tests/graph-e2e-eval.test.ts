/**
 * Unit tests for the end-to-end graph eval harness (`src/evals/graph-e2e-*`):
 * the three phases and how a failure in each is scored, output collection and
 * checks, judge parsing, skip logic, and report formatting — all with a
 * scripted provider and a fake graph runner, no network and no kernel.
 */
import { describe, it, expect } from "vitest";
import {
  runGraphE2eEval,
  formatGraphE2eReport,
  checkRunOutputs,
  outputsByName,
  parseJudgeVerdict,
  judgeGoalAchievement,
  type GraphE2eEvalCase,
  type GraphRunner,
  type GraphRunResult
} from "../src/index.js";
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
import type {
  BaseProvider,
  Message,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

// Accepts every node type; no validateNode → deep validation is skipped.
const stubRegistry = {
  has: () => true,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

const GOOD_PROGRAM = `const t = node("nodetool.input.StringInput", { name: "text" });
const s = node("${AGENT_NODE_TYPE}", { prompt: "summarize", input: t.output() });
node("nodetool.output.Output", { name: "summary", value: s.output() });
return graph();`;

/**
 * Provider that replays one scripted tool-call list per `generateLoop` call
 * (the planner) and one scripted judge answer per `generateMessageTraced` call.
 */
function createScriptedProvider(
  attempts: ToolCall[][],
  judgeAnswers: string[] = []
): BaseProvider {
  let attemptIndex = 0;
  let judgeIndex = 0;
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async generateMessageTraced(): Promise<Message> {
      const answer = judgeAnswers[judgeIndex] ?? judgeAnswers.at(-1) ?? "{}";
      judgeIndex++;
      return { role: "assistant", content: answer } as Message;
    },
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const script = attempts[attemptIndex] ?? [];
      attemptIndex++;
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

const okRunner = (result: Partial<GraphRunResult> = {}): GraphRunner =>
  async () => ({
    ok: true,
    status: "completed",
    outputs: [{ name: "summary", value: "A short summary." }],
    ...result
  });

const SUMMARIZE_CASE: GraphE2eEvalCase = {
  id: "summarize",
  description: "plans, runs, and achieves the goal",
  objective: "Summarize the input text.",
  goal: "The summary output summarizes the input.",
  inputs: { text: "hello" },
  expectGraph: { requiredInputNames: ["text"], minAgentSteps: 1 },
  expect: { requiredOutputNames: ["summary"], requireNonEmptyOutputs: true }
};

const PLAN_SCRIPT: ToolCall[][] = [
  [{ id: "s1", name: "submit_graph", args: { code: GOOD_PROGRAM } }]
];

describe("runGraphE2eEval", () => {
  it("scores a case that plans, runs, and achieves its goal", async () => {
    const provider = createScriptedProvider(PLAN_SCRIPT, [
      '{"achieved": true, "score": 1, "reasoning": "Summary matches the input."}'
    ]);

    const report = await runGraphE2eEval({
      provider,
      model: "m",
      registry: stubRegistry,
      runGraph: okRunner(),
      cases: [SUMMARIZE_CASE]
    });

    const result = report.cases[0];
    expect(result.planned).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.goalAchieved).toBe(true);
    expect(result.success).toBe(true);
    expect(result.score).toBe(1);
    expect(result.outputs).toEqual({ summary: "A short summary." });
    expect(result.judge?.reasoning).toContain("Summary matches");
    expect(report.summary.successRate).toBe(1);
    expect(report.summary.planRate).toBe(1);
    expect(report.summary.executionRate).toBe(1);
  });

  it("fails the case when the run does not complete, and never judges it", async () => {
    let judged = 0;
    const provider = createScriptedProvider(PLAN_SCRIPT, [
      '{"achieved": true, "score": 1, "reasoning": "should not be asked"}'
    ]);
    const spied = new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === "generateMessageTraced") judged++;
        return Reflect.get(target, prop, receiver);
      }
    });

    const report = await runGraphE2eEval({
      provider: spied,
      model: "m",
      registry: stubRegistry,
      runGraph: async () => ({
        ok: false,
        status: "failed",
        error: "boom",
        outputs: [],
        nodeErrors: [{ nodeId: "n1", message: "boom" }]
      }),
      cases: [SUMMARIZE_CASE]
    });

    const result = report.cases[0];
    expect(result.planned).toBe(true);
    expect(result.executed).toBe(false);
    expect(result.goalAchieved).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
    expect(judged).toBe(0);
    expect(result.checks.find((c) => c.name === "goal-achieved")?.detail).toBe(
      "run did not complete"
    );
  });

  it("fails the case when the judge says the goal was not achieved", async () => {
    const provider = createScriptedProvider(PLAN_SCRIPT, [
      '{"achieved": false, "score": 0.3, "reasoning": "Output echoes the input."}'
    ]);

    const report = await runGraphE2eEval({
      provider,
      model: "m",
      registry: stubRegistry,
      runGraph: okRunner(),
      cases: [SUMMARIZE_CASE]
    });

    const result = report.cases[0];
    expect(result.executed).toBe(true);
    expect(result.goalAchieved).toBe(false);
    expect(result.success).toBe(false);
    expect(result.judge?.score).toBe(0.3);
    expect(report.summary.executionRate).toBe(1);
    expect(report.summary.successRate).toBe(0);
  });

  it("never runs a graph the planner did not produce", async () => {
    let runs = 0;
    const provider = createScriptedProvider([[]]);

    const report = await runGraphE2eEval({
      provider,
      model: "m",
      registry: stubRegistry,
      runGraph: async () => {
        runs++;
        return { ok: true, status: "completed", outputs: [] };
      },
      cases: [SUMMARIZE_CASE],
      maxRetries: 1
    });

    expect(runs).toBe(0);
    expect(report.cases[0].planned).toBe(false);
    expect(report.cases[0].success).toBe(false);
    expect(report.summary.planRate).toBe(0);
    expect(report.summary.executionRate).toBe(0);
  });

  it("decides judge-free cases on the output checks alone", async () => {
    let judged = 0;
    const provider = createScriptedProvider(PLAN_SCRIPT, ["{}"]);
    const spied = new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === "generateMessageTraced") judged++;
        return Reflect.get(target, prop, receiver);
      }
    });

    const deterministic: GraphE2eEvalCase = {
      id: "concat",
      description: "exact output",
      objective: "Concatenate the inputs.",
      goal: 'The output is exactly "Hello, world".',
      skipJudge: true,
      expect: { requiredOutputPatterns: ["^Hello, world$"] }
    };

    const report = await runGraphE2eEval({
      provider: spied,
      model: "m",
      registry: stubRegistry,
      runGraph: okRunner({
        outputs: [{ name: "result", value: "Hello, world" }]
      }),
      cases: [deterministic]
    });

    expect(judged).toBe(0);
    expect(report.cases[0].goalAchieved).toBe(true);
    expect(report.cases[0].success).toBe(true);
  });

  it("skips model-dependent cases without configured providers", async () => {
    const provider = createScriptedProvider([]);
    const report = await runGraphE2eEval({
      provider,
      model: "m",
      registry: stubRegistry,
      runGraph: okRunner(),
      cases: [{ ...SUMMARIZE_CASE, needsModelProviders: true }]
    });

    expect(report.cases[0].skipped).toBe(true);
    expect(report.summary.skipped).toBe(1);
    expect(report.summary.successRate).toBe(0);
    expect(formatGraphE2eReport(report)).toContain("skip");
  });
});

describe("checkRunOutputs", () => {
  const run = (outputs: GraphRunResult["outputs"]): GraphRunResult => ({
    ok: true,
    status: "completed",
    outputs
  });

  it("reports a missing output by name", () => {
    const checks = checkRunOutputs(run([{ name: "other", value: "x" }]), {
      requiredOutputNames: ["summary"]
    });
    expect(checks[0].pass).toBe(false);
    expect(checks[0].detail).toContain("other");
  });

  it("fails an empty output and a run with no outputs at all", () => {
    expect(
      checkRunOutputs(run([{ name: "summary", value: "  " }]), {
        requireNonEmptyOutputs: true
      })[0].pass
    ).toBe(false);
    expect(
      checkRunOutputs(run([]), { requireNonEmptyOutputs: true })[0].detail
    ).toBe("no outputs at all");
  });

  it("matches required and forbidden patterns case-insensitively", () => {
    const checks = checkRunOutputs(
      run([{ name: "translation", value: "Guten Morgen" }]),
      {
        requiredOutputPatterns: ["guten"],
        forbiddenOutputPatterns: ["bonjour"]
      }
    );
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("keeps the last value when one output name is reported twice", () => {
    expect(
      outputsByName([
        { name: "summary", value: "first" },
        { name: "summary", value: "final" }
      ])
    ).toEqual({ summary: "final" });
  });
});

describe("parseJudgeVerdict", () => {
  it("parses a bare object, a fenced one, and clamps the score", () => {
    expect(parseJudgeVerdict('{"achieved":true,"score":1,"reasoning":"ok"}'))
      .toMatchObject({ achieved: true, score: 1 });
    expect(
      parseJudgeVerdict(
        'Here it is:\n```json\n{"achieved":false,"score":2,"reasoning":"no"}\n```'
      )
    ).toMatchObject({ achieved: false, score: 1 });
  });

  it("returns null for prose and for an answer missing the verdict", () => {
    expect(parseJudgeVerdict("Looks good to me!")).toBeNull();
    expect(parseJudgeVerdict('{"score": 1}')).toBeNull();
  });
});

describe("judgeGoalAchievement", () => {
  it("reports a provider failure as a judge error, not a passing goal", async () => {
    const provider = {
      provider: "scripted",
      getTotalCost: () => 0,
      generateMessageTraced: async () => {
        throw new Error("no credit");
      }
    } as unknown as BaseProvider;

    const verdict = await judgeGoalAchievement({
      provider,
      model: "m",
      objective: "o",
      goal: "g",
      outputs: { summary: "x" }
    });
    expect(verdict.achieved).toBe(false);
    expect(verdict.error).toContain("no credit");
  });

  it("reports an unparseable answer as a judge error", async () => {
    const provider = {
      provider: "scripted",
      getTotalCost: () => 0,
      generateMessageTraced: async () => ({
        role: "assistant",
        content: "definitely achieved"
      })
    } as unknown as BaseProvider;

    const verdict = await judgeGoalAchievement({
      provider,
      model: "m",
      objective: "o",
      goal: "g",
      outputs: { summary: "x" }
    });
    expect(verdict.achieved).toBe(false);
    expect(verdict.error).toContain("parseable");
  });
});
