/**
 * Unit tests for the end-to-end graph eval harness (`src/evals/graph-e2e-*`):
 * the three phases and how a failure in each is scored, output collection and
 * checks, judge parsing, skip logic, and report formatting — with a provider
 * replaying real DSL code actions and a fake graph runner: no network and no
 * kernel.
 */
import { beforeAll, describe, it, expect } from "vitest";
import {
  GRAPH_E2E_EVAL_CASES,
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
import { GRAPH_DSL_PACKAGE } from "../src/codeact/graph-dsl-package.js";
import { shippedPackCatalog } from "../src/evals/codeact-sandbox-pack-cases.js";
import type {
  BaseProvider,
  Message,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

// Accepts every node type; no validateNode → deep validation is skipped.
const stubRegistry = {
  has: () => true,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

// The harness builds its own context, so the DSL pack has to reach it the way
// it reaches the CLI: as this process's catalog.
beforeAll(() => {
  setProcessSandboxModuleCatalog(shippedPackCatalog());
});

/** One input feeding one Agent step feeding one output — via the typed pack. */
const GOOD_PROGRAM = [
  `import { workflow } from "${GRAPH_DSL_PACKAGE}";`,
  `import { stringInput } from "${GRAPH_DSL_PACKAGE}/nodetool.input";`,
  `import { agent } from "${GRAPH_DSL_PACKAGE}/nodetool.agents";`,
  `import { output } from "${GRAPH_DSL_PACKAGE}/nodetool.output";`,
  'const t = stringInput({ name: "text" });',
  'const s = agent({ prompt: t.output() });',
  'const graph = workflow(output({ name: "summary", value: s.output("text") }));',
  "await finish(graph);"
].join("\n");

/**
 * Provider that replays code actions through `generateLoop` (the authoring
 * sub-agent) and one scripted judge answer per `generateMessageTraced` call.
 */
function createScriptedProvider(
  actions: string[],
  judgeAnswers: string[] = []
): BaseProvider {
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
        execute?: (a: Record<string, unknown>, id: string) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const tool = (args.tools ?? []).find((t) => t.name === "execute_code");
      let round = 0;
      for (const code of actions) {
        if (args.signal?.aborted) break;
        round++;
        const call = { title: "Author the graph", code };
        yield {
          id: `call_${round}`,
          name: "execute_code",
          args: call
        } as unknown as ProviderStreamItem;
        await tool?.execute?.(call, `call_${round}`);
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

const PLAN_SCRIPT = [GOOD_PROGRAM];

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

  it("stamps the run policy onto Agent nodes before executing", async () => {
    const provider = createScriptedProvider(PLAN_SCRIPT, [
      '{"achieved": true, "score": 1, "reasoning": "ok"}'
    ]);
    let ranGraph: { nodes: { type: string; properties?: unknown }[] } | null =
      null;

    await runGraphE2eEval({
      provider,
      model: "planner-model",
      registry: stubRegistry,
      executionProviderId: "anthropic",
      executionModel: "claude-sonnet-5",
      runGraph: async ({ graph }) => {
        ranGraph = graph;
        return { ok: true, status: "completed", outputs: [] };
      },
      cases: [SUMMARIZE_CASE]
    });

    // Authoring emits model-less Agent nodes on purpose; without the policy
    // every LLM step would die on "Select a model" at run time.
    const agent = ranGraph!.nodes.find((n) => n.type === AGENT_NODE_TYPE);
    expect(agent?.properties).toMatchObject({
      model: { provider: "anthropic", id: "claude-sonnet-5" }
    });
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

  it("never runs a graph authoring did not produce", async () => {
    let runs = 0;
    const provider = createScriptedProvider([]);

    const report = await runGraphE2eEval({
      provider,
      model: "m",
      registry: stubRegistry,
      runGraph: async () => {
        runs++;
        return { ok: true, status: "completed", outputs: [] };
      },
      cases: [SUMMARIZE_CASE],
      maxIterations: 2
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
    // The output checks decide the goal; scoring them again under a
    // `goal-achieved` check would weigh the same failures twice.
    expect(report.cases[0].checks.some((c) => c.name === "goal-achieved")).toBe(
      false
    );
    expect(report.cases[0].score).toBe(1);
  });

  it("fails a judge-free case whose pinned output is wrong, without judging", async () => {
    let judged = 0;
    const provider = createScriptedProvider(PLAN_SCRIPT, ["{}"]);
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
      runGraph: okRunner({ outputs: [{ name: "total", value: 44.8 }] }),
      cases: [
        {
          id: "code-aggregate",
          description: "exact arithmetic",
          objective: "Total the line items.",
          goal: "total is 44.85.",
          skipJudge: true,
          expect: { expectedOutputs: { total: 44.85 } }
        }
      ]
    });

    expect(judged).toBe(0);
    expect(report.cases[0].executed).toBe(true);
    expect(report.cases[0].goalAchieved).toBe(false);
    expect(report.cases[0].checks.find((c) => c.name === "equals:total")?.pass).toBe(
      false
    );
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

  it("pins an output character for character, case included", () => {
    const expect_ = {
      expectedOutputs: {
        roster: "3 attendees: June Okafor; Omar Haddad; Priya Sharma"
      }
    };
    expect(
      checkRunOutputs(
        run([
          {
            name: "roster",
            value: "3 attendees: June Okafor; Omar Haddad; Priya Sharma"
          }
        ]),
        expect_
      )[0].pass
    ).toBe(true);
    // `requiredOutputPatterns` matches case-insensitively, so only this check
    // can tell a formatting result from a nearly-right one.
    const wrongCase = checkRunOutputs(
      run([
        {
          name: "roster",
          value: "3 attendees: june okafor; Omar Haddad; Priya Sharma"
        }
      ]),
      expect_
    )[0];
    expect(wrongCase.pass).toBe(false);
    expect(wrongCase.detail).toContain("june okafor");
  });

  it("reports a pinned output the run never produced", () => {
    const check = checkRunOutputs(run([{ name: "other", value: "x" }]), {
      expectedOutputs: { total: 44.85 }
    })[0];
    expect(check.pass).toBe(false);
    expect(check.detail).toContain("no such output");
  });

  it("accepts a pinned number that arrives as its decimal string", () => {
    const checks = checkRunOutputs(
      run([
        { name: "total", value: "44.85" },
        { name: "item_count", value: 3 }
      ]),
      { expectedOutputs: { total: 44.85, item_count: 3 } }
    );
    expect(checks.every((c) => c.pass)).toBe(true);
    expect(
      checkRunOutputs(run([{ name: "total", value: "44.8" }]), {
        expectedOutputs: { total: 44.85 }
      })[0].pass
    ).toBe(false);
  });

  it("compares a pinned structured output by value", () => {
    expect(
      checkRunOutputs(run([{ name: "row", value: { id: "A-4417", items: 3 } }]), {
        expectedOutputs: { row: { id: "A-4417", items: 3 } }
      })[0].pass
    ).toBe(true);
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

describe("GRAPH_E2E_EVAL_CASES", () => {
  const byId = (id: string): GraphE2eEvalCase => {
    const found = GRAPH_E2E_EVAL_CASES.find((c) => c.id === id);
    if (!found) throw new Error(`case ${id} is gone`);
    return found;
  };

  it("keeps the Code-node cases runnable without a model provider", () => {
    // A Code node is deterministic, so these cost nothing beyond the plan and
    // are the suite's cheap coverage. Marking one `needsModelProviders` would
    // silently drop it from a keyless run.
    for (const id of ["code-parse-json", "code-aggregate", "code-format"]) {
      const evalCase = byId(id);
      expect(evalCase.needsModelProviders).toBeUndefined();
      expect(evalCase.skipJudge).toBe(true);
      expect(Object.keys(evalCase.expect.expectedOutputs ?? {}).length).toBeGreaterThan(0);
      expect(evalCase.expectGraph?.forbiddenNodeTypePatterns).toContain(
        "^nodetool\\.agents\\."
      );
    }
  });

  it("declares a model provider for every case that plans an Agent step", () => {
    for (const evalCase of GRAPH_E2E_EVAL_CASES) {
      const wantsAgent =
        (evalCase.expectGraph?.minAgentSteps ?? 0) > 0 ||
        (evalCase.expectGraph?.requiredNodeTypePatterns ?? []).some((p) =>
          p.includes("agents")
        );
      if (wantsAgent) expect(evalCase.needsModelProviders).toBe(true);
    }
  });

  it("judges the mixed case and pins only its deterministic half", () => {
    const mixed = byId("code-then-agent");
    expect(mixed.skipJudge).toBeUndefined();
    expect(Object.keys(mixed.expect.expectedOutputs ?? {})).toEqual([
      "complaints"
    ]);
    expect(mixed.expect.requiredOutputNames).toContain("summary");
  });

  it("declares every case's run params as inputs the planner is given", () => {
    for (const evalCase of GRAPH_E2E_EVAL_CASES) {
      if (evalCase.params) continue;
      for (const name of evalCase.expectGraph?.requiredInputNames ?? []) {
        expect(Object.keys(evalCase.inputs ?? {})).toContain(name);
      }
    }
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
