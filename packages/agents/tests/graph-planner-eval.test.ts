/**
 * Unit tests for the GraphPlanner eval harness (`src/evals/`): metrics
 * collection from the message stream, expectation scoring, skip logic, and
 * report formatting — all with a scripted provider, no network.
 */
import { describe, it, expect } from "vitest";
import {
  runGraphPlannerEval,
  formatEvalReport,
  checkExpectations,
  type GraphPlannerEvalCase
} from "../src/index.js";
import { AGENT_STEP_NODE_TYPE } from "../src/graph-builder.js";
import type {
  BaseProvider,
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

/** Provider replaying one scripted tool-call list per generateLoop call. */
function createScriptedProvider(attempts: ToolCall[][]): BaseProvider {
  let attemptIndex = 0;
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
      const script = attempts[attemptIndex] ?? [];
      attemptIndex++;
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc as unknown as ProviderStreamItem;
        await toolMap.get(tc.name)?.execute?.(tc.args as Record<string, unknown>);
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const GOOD_PROGRAM = `const t = node("nodetool.input.StringInput", { name: "text" });
const s = node("${AGENT_STEP_NODE_TYPE}", { instructions: "summarize", input: t.output() });
node("nodetool.output.Output", { name: "summary", value: s.output() });
return graph();`;

const CASES: GraphPlannerEvalCase[] = [
  {
    id: "good",
    description: "passes all checks",
    objective: "Summarize the input text.",
    inputs: { text: "hello" },
    expect: {
      requiredInputNames: ["text"],
      minAgentSteps: 1,
      requireOutputNode: true,
      minNodes: 3
    }
  },
  {
    id: "needs-models",
    description: "skipped without providers",
    objective: "Generate an image.",
    needsModelProviders: true,
    expect: {}
  }
];

describe("runGraphPlannerEval", () => {
  it("collects metrics, scores expectations, and skips model-dependent cases", async () => {
    // Case "good": one failed submission (feedback round) then success.
    const provider = createScriptedProvider([
      [
        { id: "s1", name: "submit_graph", args: { code: "return graph();" } },
        { id: "s2", name: "submit_graph", args: { code: GOOD_PROGRAM } }
      ]
    ]);

    const report = await runGraphPlannerEval({
      provider,
      model: "test-model",
      registry: stubRegistry,
      cases: CASES
    });

    expect(report.provider).toBe("scripted");
    expect(report.cases).toHaveLength(2);

    const good = report.cases[0];
    expect(good.accepted).toBe(true);
    expect(good.score).toBe(1);
    expect(good.submitRounds).toBe(2);
    expect(good.toolCalls["submit_graph"]).toBe(2);
    expect(good.nodes).toBe(3);
    expect(good.edges).toBe(2);
    expect(good.checks.every((c) => c.pass)).toBe(true);

    const skipped = report.cases[1];
    expect(skipped.skipped).toBe(true);

    expect(report.summary.total).toBe(2);
    expect(report.summary.skipped).toBe(1);
    expect(report.summary.accepted).toBe(1);
    expect(report.summary.successRate).toBe(1);
    // 2 submits on the accepted case → not a one-shot.
    expect(report.summary.oneShotRate).toBe(0);
    expect(report.summary.avgSubmitRounds).toBe(2);
  });

  it("scores a failed case 0 and reports the error check", async () => {
    // Model never submits anything, all attempts fail.
    const provider = createScriptedProvider([[], [], []]);
    const report = await runGraphPlannerEval({
      provider,
      model: "test-model",
      registry: stubRegistry,
      cases: [CASES[0]],
      maxRetries: 2
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(false);
    expect(r.score).toBe(0);
    expect(r.attempts).toBe(2);
    expect(report.summary.successRate).toBe(0);
  });

  it("formats a readable report", async () => {
    const provider = createScriptedProvider([
      [{ id: "s1", name: "submit_graph", args: { code: GOOD_PROGRAM } }]
    ]);
    const report = await runGraphPlannerEval({
      provider,
      model: "test-model",
      registry: stubRegistry,
      cases: [CASES[0]]
    });
    const text = formatEvalReport(report);
    expect(text).toContain("provider=scripted model=test-model");
    expect(text).toContain("good");
    expect(text).toContain("success 1/1 (100%)");
    expect(text).toContain("one-shot 100%");
  });
});

describe("checkExpectations", () => {
  it("flags missing inputs, forbidden types, and provider-locked nodes", () => {
    const graph = {
      nodes: [
        {
          id: "a",
          type: "openai.image.CreateImage",
          name: "a",
          properties: {}
        },
        {
          id: "b",
          type: AGENT_STEP_NODE_TYPE,
          name: "b",
          properties: { instructions: "x" }
        }
      ],
      edges: []
    };
    const checks = checkExpectations(graph, {
      requiredInputNames: ["text"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\.AgentStep$"],
      requiredSourceHandles: ["if_true"]
    });
    const byName = Object.fromEntries(checks.map((c) => [c.name, c.pass]));
    expect(byName["input:text"]).toBe(false);
    expect(byName["not:^nodetool\\.agents\\.AgentStep$"]).toBe(false);
    expect(byName["handle:if_true"]).toBe(false);
    expect(byName["no-provider-nodes"]).toBe(false);
  });
});
