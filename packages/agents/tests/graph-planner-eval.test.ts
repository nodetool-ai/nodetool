/**
 * Unit tests for the graph authoring eval harness (`src/evals/`): metrics
 * collection from the message stream, expectation scoring, skip logic, and
 * report formatting.
 *
 * The harness drives `authorGraph`, so a "scripted provider" here replays code
 * actions rather than tool calls: each action is real DSL code, run in the real
 * QuickJS sandbox against the real shipped pack. No network.
 */
import { beforeAll, describe, it, expect } from "vitest";
import {
  runGraphPlannerEval,
  formatEvalReport,
  checkExpectations,
  type GraphPlannerEvalCase
} from "../src/index.js";
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
import { GRAPH_DSL_PACKAGE } from "../src/codeact/graph-dsl-package.js";
import { shippedPackCatalog } from "../src/evals/codeact-sandbox-pack-cases.js";
import type { BaseProvider, ProviderStreamItem } from "@nodetool-ai/runtime";
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

/**
 * Provider replaying a list of code actions, the way `generateLoop` drives a
 * real one: every action in the same loop, each executed as it is yielded.
 */
function createScriptedProvider(actions: string[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
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

/** One input feeding one Agent step feeding one output — via the typed pack. */
const GOOD_PROGRAM = [
  `import { workflow } from "${GRAPH_DSL_PACKAGE}";`,
  `import { stringInput } from "${GRAPH_DSL_PACKAGE}/nodetool.input";`,
  `import { agent } from "${GRAPH_DSL_PACKAGE}/nodetool.agents";`,
  `import { output } from "${GRAPH_DSL_PACKAGE}/nodetool.output";`,
  'const t = stringInput({ name: "text" });',
  'const s = agent({ prompt: t.output() });',
  "const graph = workflow(output({ name: \"summary\", value: s.output(\"text\") }));",
  "await finish(graph);"
].join("\n");

/** An action that runs cleanly but hands nothing back. */
const NO_FINISH_PROGRAM = "1 + 1;";

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
    // Case "good": one action that hands nothing back, then one that does.
    const provider = createScriptedProvider([NO_FINISH_PROGRAM, GOOD_PROGRAM]);

    const report = await runGraphPlannerEval({
      provider,
      model: "test-model",
      registry: stubRegistry,
      cases: CASES,
      maxIterations: 4
    });

    expect(report.provider).toBe("scripted");
    expect(report.cases).toHaveLength(2);

    const good = report.cases[0];
    expect(good.accepted).toBe(true);
    expect(good.score).toBe(1);
    expect(good.authoringRounds).toBe(2);
    expect(good.toolCalls["execute_code"]).toBe(2);
    expect(good.nodes).toBe(3);
    expect(good.edges).toBe(2);
    expect(good.checks.every((c) => c.pass)).toBe(true);

    const skipped = report.cases[1];
    expect(skipped.skipped).toBe(true);

    expect(report.summary.total).toBe(2);
    expect(report.summary.skipped).toBe(1);
    expect(report.summary.accepted).toBe(1);
    expect(report.summary.successRate).toBe(1);
    // 2 actions on the authored case → not a one-shot.
    expect(report.summary.oneShotRate).toBe(0);
    expect(report.summary.avgAuthoringRounds).toBe(2);
  }, 120_000);

  it("scores a failed case 0 and reports the error check", async () => {
    // The model writes code but never hands a graph back.
    const provider = createScriptedProvider([NO_FINISH_PROGRAM]);
    const report = await runGraphPlannerEval({
      provider,
      model: "test-model",
      registry: stubRegistry,
      cases: [CASES[0]],
      maxIterations: 2
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(false);
    expect(r.score).toBe(0);
    expect(report.summary.successRate).toBe(0);
  }, 120_000);

  it("formats a readable report", async () => {
    const provider = createScriptedProvider([GOOD_PROGRAM]);
    const report = await runGraphPlannerEval({
      provider,
      model: "test-model",
      registry: stubRegistry,
      cases: [CASES[0]],
      maxIterations: 2
    });
    const text = formatEvalReport(report);
    expect(text).toContain("provider=scripted model=test-model");
    expect(text).toContain("good");
    expect(text).toContain("success 1/1 (100%)");
    expect(text).toContain("one-shot 100%");
  }, 120_000);
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

describe("checkExpectations — reachability and property text", () => {
  const pdfGraph = (agentPrompt: string) => ({
    nodes: [
      {
        id: "doc",
        type: "nodetool.input.DocumentInput",
        name: "doc",
        properties: { name: "document" }
      },
      {
        id: "step",
        type: AGENT_NODE_TYPE,
        name: "step",
        properties: { prompt: agentPrompt }
      },
      {
        id: "out",
        type: "nodetool.output.Output",
        name: "out",
        properties: { name: "summary" }
      }
    ],
    edges: [
      {
        id: "e1",
        source: "doc",
        sourceHandle: "output",
        target: "step",
        targetHandle: "prompt"
      },
      {
        id: "e2",
        source: "step",
        sourceHandle: "text",
        target: "out",
        targetHandle: "value"
      }
    ]
  });

  const expectations = {
    requiredReachablePaths: [
      { from: "^nodetool\\.input\\.Document", to: "^nodetool\\.agents\\." }
    ],
    requiredPropertyTextPatterns: ["bullet"]
  };

  const pass = (checks: ReturnType<typeof checkExpectations>, name: string) =>
    checks.find((c) => c.name === name)?.pass;

  const reachName =
    "reaches:^nodetool\\.input\\.Document->^nodetool\\.agents\\.";

  it("passes a document input wired into an LLM step that asks for bullets", () => {
    const checks = checkExpectations(
      pdfGraph("Summarize the document as bullet points."),
      expectations
    );
    expect(pass(checks, reachName)).toBe(true);
    expect(pass(checks, "propText:bullet")).toBe(true);
  });

  it("fails when nothing asks for bullets", () => {
    const checks = checkExpectations(
      pdfGraph("Summarize the document."),
      expectations
    );
    expect(pass(checks, "propText:bullet")).toBe(false);
  });

  it("fails when the input never reaches the LLM step", () => {
    const disconnected = pdfGraph("Bullet points, please.");
    disconnected.edges = disconnected.edges.filter((e) => e.id !== "e1");
    const checks = checkExpectations(disconnected, expectations);
    expect(pass(checks, reachName)).toBe(false);
    expect(checks.find((c) => c.name === reachName)?.detail).toContain("no path");
  });
});

const CODE_NODE_TYPE = "nodetool.code.Code";

/**
 * One Code node fed by an input, whose `total` handle reaches an output node.
 * The body's imports and the second consumer vary per test.
 */
function codeGraph(options: {
  imports?: string[];
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
        code:
          (options.imports ?? [])
            .map((specifier) => `import * as m from "${specifier}";\n`)
            .join("") + "return { total: 1 };"
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

  it("forbids any imported sandbox package", () => {
    expect(
      pass(
        checkExpectations(codeGraph({}), { forbidCodePackages: true }),
        "codePackages:none"
      )
    ).toBe(true);
    expect(
      pass(
        checkExpectations(
          codeGraph({ imports: ["@nodetool-ai/sandbox-csv"] }),
          { forbidCodePackages: true }
        ),
        "codePackages:none"
      )
    ).toBe(false);
  });

  it("allows only the listed specifiers", () => {
    const allowed = ["@nodetool-ai/sandbox-csv"];
    expect(
      pass(
        checkExpectations(codeGraph({ imports: allowed }), {
          allowedCodePackages: allowed
        }),
        "codePackages:allowed"
      )
    ).toBe(true);

    const hallucinated = checkExpectations(
      codeGraph({ imports: ["papaparse"] }),
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
