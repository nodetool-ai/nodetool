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
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
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
const s = node("${AGENT_NODE_TYPE}", { prompt: "summarize", input: t.output() });
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
          type: AGENT_NODE_TYPE,
          name: "b",
          properties: { prompt: "x" }
        }
      ],
      edges: []
    };
    const checks = checkExpectations(graph, {
      requiredInputNames: ["text"],
      forbiddenNodeTypePatterns: ["^nodetool\\.agents\\."],
      requiredSourceHandles: ["if_true"]
    });
    const byName = Object.fromEntries(checks.map((c) => [c.name, c.pass]));
    expect(byName["input:text"]).toBe(false);
    expect(byName["not:^nodetool\\.agents\\."]).toBe(false);
    expect(byName["handle:if_true"]).toBe(false);
    expect(byName["no-provider-nodes"]).toBe(false);
  });
});

const CODE_NODE_TYPE = "nodetool.code.Code";

/**
 * One Code node fed by an input, whose `total` handle reaches an output node.
 * `packages` and the second consumer vary per test.
 */
function codeGraph(options: {
  packages?: unknown[];
  outputHandle?: string;
  consumerType?: string;
  extraCodeNode?: boolean;
}) {
  const handle = options.outputHandle ?? "total";
  const consumer = options.consumerType ?? "nodetool.output.Output";
  const nodes = [
    {
      id: "rows",
      type: "nodetool.input.StringInput",
      name: "rows",
      properties: { name: "rows" }
    },
    {
      id: "code",
      type: CODE_NODE_TYPE,
      name: "code",
      properties: {
        code: "return { total: 1 };",
        ...(options.packages ? { packages: options.packages } : {})
      }
    },
    {
      id: "consumer",
      type: consumer,
      name: "consumer",
      properties: { name: "total" }
    }
  ];
  const edges = [
    {
      id: "e1",
      source: "rows",
      sourceHandle: "output",
      target: "code",
      targetHandle: "rows"
    },
    {
      id: "e2",
      source: "code",
      sourceHandle: handle,
      target: "consumer",
      targetHandle: "value"
    }
  ];
  if (options.extraCodeNode) {
    nodes.push({
      id: "code2",
      type: CODE_NODE_TYPE,
      name: "code2",
      properties: { code: "return { out: 2 };" }
    });
  }
  return { nodes, edges };
}

describe("checkExpectations — Code node checks", () => {
  const pass = (checks: ReturnType<typeof checkExpectations>, name: string) =>
    checks.find((c) => c.name === name)?.pass;

  it("counts Code nodes against the minimum and the maximum", () => {
    const one = checkExpectations(codeGraph({}), {
      minCodeNodes: 1,
      maxCodeNodes: 1
    });
    expect(pass(one, "codeNodes>=1")).toBe(true);
    expect(pass(one, "codeNodes<=1")).toBe(true);

    const two = checkExpectations(codeGraph({ extraCodeNode: true }), {
      minCodeNodes: 3,
      maxCodeNodes: 1
    });
    expect(pass(two, "codeNodes>=3")).toBe(false);
    expect(pass(two, "codeNodes<=1")).toBe(false);
  });

  it("reads output handles off declarations and outgoing edges", () => {
    const wired = checkExpectations(codeGraph({ outputHandle: "total" }), {
      requiredCodeOutputHandles: ["total"],
      requireCodeOutputs: true
    });
    expect(pass(wired, "codeOutput:total")).toBe(true);
    expect(pass(wired, "codeOutputs")).toBe(true);

    const wrong = checkExpectations(codeGraph({ outputHandle: "output" }), {
      requiredCodeOutputHandles: ["total"]
    });
    expect(pass(wrong, "codeOutput:total")).toBe(false);

    const declaredOnly = {
      nodes: [
        {
          id: "code",
          type: CODE_NODE_TYPE,
          name: "code",
          properties: {},
          dynamic_outputs: { total: { type: "float", type_args: [] } }
        }
      ],
      edges: []
    };
    expect(
      pass(
        checkExpectations(declaredOnly, {
          requiredCodeOutputHandles: ["total"]
        }),
        "codeOutput:total"
      )
    ).toBe(true);
  });

  it("flags a Code node that exposes no output handle at all", () => {
    const inert = {
      nodes: [
        { id: "code", type: CODE_NODE_TYPE, name: "code", properties: {} }
      ],
      edges: []
    };
    const checks = checkExpectations(inert, { requireCodeOutputs: true });
    expect(pass(checks, "codeOutputs")).toBe(false);
    expect(checks.find((c) => c.name === "codeOutputs")?.detail).toContain(
      "code"
    );
  });

  it("forbids any declared sandbox package", () => {
    expect(
      pass(
        checkExpectations(codeGraph({}), { forbidCodePackages: true }),
        "codePackages:none"
      )
    ).toBe(true);
    expect(
      pass(
        checkExpectations(codeGraph({ packages: ["@nodetool-ai/sandbox-csv"] }), {
          forbidCodePackages: true
        }),
        "codePackages:none"
      )
    ).toBe(false);
  });

  it("allows only the listed specifiers, in either declaration shape", () => {
    const allowed = ["@nodetool-ai/sandbox-csv"];
    expect(
      pass(
        checkExpectations(codeGraph({ packages: allowed }), {
          allowedCodePackages: allowed
        }),
        "codePackages:allowed"
      )
    ).toBe(true);
    expect(
      pass(
        checkExpectations(
          codeGraph({ packages: [{ specifier: "@nodetool-ai/sandbox-csv" }] }),
          { allowedCodePackages: allowed }
        ),
        "codePackages:allowed"
      )
    ).toBe(true);

    const hallucinated = checkExpectations(
      codeGraph({ packages: ["papaparse"] }),
      { allowedCodePackages: allowed }
    );
    expect(pass(hallucinated, "codePackages:allowed")).toBe(false);
    expect(
      hallucinated.find((c) => c.name === "codePackages:allowed")?.detail
    ).toContain("papaparse");
  });

  it("checks what a Code node feeds", () => {
    const pattern = "^nodetool\\.agents\\.Agent$";
    expect(
      pass(
        checkExpectations(codeGraph({ consumerType: AGENT_NODE_TYPE }), {
          codeFeedsNodeTypePatterns: [pattern]
        }),
        `codeFeeds:${pattern}`
      )
    ).toBe(true);
    expect(
      pass(
        checkExpectations(codeGraph({}), {
          codeFeedsNodeTypePatterns: [pattern]
        }),
        `codeFeeds:${pattern}`
      )
    ).toBe(false);
  });
});
