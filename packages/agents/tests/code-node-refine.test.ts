/**
 * The post-submit Code-node pass: it replaces a body CodePlanner improves,
 * keeps the authored body whenever the new one would not honour the graph's
 * wiring or the planner fails, and does nothing when the planner option is off.
 */
import { describe, it, expect } from "vitest";
import { refineCodeNodes } from "../src/code-node-refine.js";
import type { CodeNodeRefinementReport } from "../src/code-node-refine.js";
import { GraphPlanner } from "../src/graph-planner.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { GraphData, ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

const CODE_TYPE = "nodetool.code.Code";

const AUTHORED_CODE = "return { total: 0 };";
const IMPROVED_CODE =
  'const words = inputs.text.split(" ");\nreturn { total: words.length };';

// The pass only needs `has` / `getMetadata`; without `validateNode` the deep
// re-validation is skipped, which is the shape a thin caller has.
const stubRegistry = {
  has: () => true,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

function makeGraph(code = AUTHORED_CODE): GraphData {
  return {
    nodes: [
      {
        id: "source",
        type: "nodetool.input.StringInput",
        properties: { name: "text" }
      },
      { id: "code_1", type: CODE_TYPE, properties: { code, packages: [] } },
      {
        id: "sink",
        type: "nodetool.output.Output",
        properties: { name: "total" }
      }
    ],
    edges: [
      {
        id: "e1",
        source: "source",
        sourceHandle: "output",
        target: "code_1",
        targetHandle: "text"
      },
      {
        id: "e2",
        source: "code_1",
        sourceHandle: "total",
        target: "sink",
        targetHandle: "value"
      }
    ]
  };
}

function submitCodeCall(overrides: Record<string, unknown> = {}): ToolCall {
  return {
    id: "call_1",
    name: "submit_code",
    args: {
      title: "Count the words",
      summary: "Splits the text on whitespace and returns the word count.",
      code: IMPROVED_CODE,
      inputs: [{ name: "text", type: { type: "any" } }],
      outputs: [{ name: "total", type: { type: "int" } }],
      ...overrides
    }
  } as unknown as ToolCall;
}

/** Replays a scripted tool-call list, dispatching each to the tool's execute. */
function createScriptedProvider(
  script: ToolCall[],
  seen: string[] = []
): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (
          a: Record<string, unknown>,
          id?: string
        ) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      for (const tool of args.tools ?? []) seen.push(tool.name);
      const tools = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const call of script) {
        if (args.signal?.aborted) break;
        yield call as unknown as ProviderStreamItem;
        await tools.get(call.name)?.execute?.(
          call.args as Record<string, unknown>,
          call.id
        );
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

async function drain<T>(
  gen: AsyncGenerator<ProcessingMessage, T>
): Promise<{ result: T; messages: ProcessingMessage[] }> {
  const messages: ProcessingMessage[] = [];
  let next = await gen.next();
  while (!next.done) {
    messages.push(next.value);
    next = await gen.next();
  }
  return { result: next.value, messages };
}

function refine(
  graph: GraphData,
  provider: BaseProvider
): AsyncGenerator<ProcessingMessage, CodeNodeRefinementReport> {
  return refineCodeNodes(graph, {
    provider,
    model: "scripted-model",
    registry: stubRegistry,
    objective: "Count the words in the input text."
  });
}

describe("refineCodeNodes", () => {
  it("replaces the authored body with the accepted submission", async () => {
    const graph = makeGraph();
    const provider = createScriptedProvider([submitCodeCall()]);

    const { result } = await drain(refine(graph, provider));

    expect(result.eligible).toBe(1);
    expect(result.refined).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(graph.nodes[1].properties?.code).toBe(IMPROVED_CODE);
  });

  it("seeds the wired handles as the contract for the submission", async () => {
    const graph = makeGraph();
    // Renaming the wired input leaves the edge pointing at a handle the node
    // no longer has, so the tool rejects the round.
    const provider = createScriptedProvider([
      submitCodeCall({
        inputs: [{ name: "renamed", type: { type: "any" } }],
        code: "return { total: inputs.renamed.length };"
      })
    ]);

    const { result } = await drain(refine(graph, provider));

    expect(result.refined).toBe(0);
    expect(graph.nodes[1].properties?.code).toBe(AUTHORED_CODE);
    expect(result.outcomes[0]).toMatchObject({
      nodeId: "code_1",
      status: "kept"
    });
  });

  it("keeps the authored body when a submission drops a consumed output", async () => {
    const graph = makeGraph();
    const provider = createScriptedProvider([
      submitCodeCall({
        code: "return { count: 1 };",
        outputs: [{ name: "count", type: { type: "int" } }]
      })
    ]);

    const { result } = await drain(refine(graph, provider));

    expect(result.refined).toBe(0);
    expect(graph.nodes[1].properties?.code).toBe(AUTHORED_CODE);
    expect(result.outcomes[0].reason).toContain("total");
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps the authored body when the planner never submits", async () => {
    const graph = makeGraph();
    const provider = createScriptedProvider([]);

    const { result, messages } = await drain(refine(graph, provider));

    expect(result.refined).toBe(0);
    expect(graph.nodes[1].properties?.code).toBe(AUTHORED_CODE);
    expect(result.outcomes[0].reason).toContain("no_valid_submission");
    expect(
      messages.some(
        (message) =>
          message.type === "planning_update" &&
          message.phase === "code_refinement" &&
          message.status === "failed"
      )
    ).toBe(true);
  });

  it("keeps the authored body when the provider throws", async () => {
    const graph = makeGraph();
    const provider = {
      provider: "broken",
      hasToolSupport: async () => true,
      // eslint-disable-next-line require-yield
      async *generateLoop(): AsyncGenerator<ProviderStreamItem> {
        throw new Error("provider exploded");
      }
    } as unknown as BaseProvider;

    const { result } = await drain(refine(graph, provider));

    expect(result.refined).toBe(0);
    expect(graph.nodes[1].properties?.code).toBe(AUTHORED_CODE);
    expect(result.outcomes[0].status).toBe("kept");
  });

  it("reverts a body that the graph validator rejects", async () => {
    // With `validateNode` present the pass re-validates the patched graph; a
    // body reading an input the node does not have must not survive that.
    const deepRegistry = {
      has: () => true,
      getMetadata: () => undefined,
      validateNode: () => [],
      listMetadata: () => []
    } as unknown as NodeRegistry;
    const graph = makeGraph();
    const provider = createScriptedProvider([
      submitCodeCall({
        code: "return { total: inputs.ghost.length };"
      })
    ]);

    const { result } = await drain(
      refineCodeNodes(graph, {
        provider,
        model: "scripted-model",
        registry: deepRegistry,
        objective: "Count the words."
      })
    );

    expect(result.refined).toBe(0);
    expect(graph.nodes[1].properties?.code).toBe(AUTHORED_CODE);
    expect(result.outcomes[0].reason).toContain("fails validation");
  });

  it("skips a Code node whose body arrives on an edge", async () => {
    const graph = makeGraph();
    graph.edges.push({
      id: "e3",
      source: "source",
      sourceHandle: "output",
      target: "code_1",
      targetHandle: "code"
    });
    const provider = createScriptedProvider([submitCodeCall()]);

    const { result } = await drain(refine(graph, provider));

    expect(result.eligible).toBe(0);
    expect(graph.nodes[1].properties?.code).toBe(AUTHORED_CODE);
  });

  it("caps how many Code nodes one graph refines", async () => {
    const graph = makeGraph();
    graph.nodes.push({
      id: "code_2",
      type: CODE_TYPE,
      properties: { code: AUTHORED_CODE }
    });
    const provider = createScriptedProvider([submitCodeCall()]);

    const { result } = await drain(
      refineCodeNodes(graph, {
        provider,
        model: "scripted-model",
        registry: stubRegistry,
        objective: "Count the words.",
        maxNodes: 1
      })
    );

    expect(result.eligible).toBe(2);
    expect(result.warnings[0]).toContain("Refined 1 of 2 Code nodes");
  });
});

const GRAPH_PROGRAM = `
const text = node("nodetool.input.StringInput", { name: "text" });
const counted = node("${CODE_TYPE}", {
  text: text.output(),
  code: ${JSON.stringify(AUTHORED_CODE)}
});
node("nodetool.output.Output", { name: "total", value: counted.output("total") });
return graph();
`;

describe("GraphPlanner refineCodeNodes option", () => {
  const submitGraph: ToolCall = {
    id: "call_graph",
    name: "submit_graph",
    args: { code: GRAPH_PROGRAM }
  } as unknown as ToolCall;

  async function plan(refineCode: boolean | undefined) {
    const offered: string[] = [];
    const provider = createScriptedProvider(
      [submitGraph, submitCodeCall()],
      offered
    );
    const planner = new GraphPlanner({
      provider,
      model: "scripted-model",
      registry: stubRegistry,
      ...(refineCode === undefined ? {} : { refineCodeNodes: refineCode })
    });
    const { result } = await drain(
      planner.plan("Count the words in the input text.", createMockContext())
    );
    return { graph: result, offered };
  }

  it("refines Code bodies by default", async () => {
    const { graph, offered } = await plan(undefined);
    const codeNode = graph?.nodes.find((node) => node.type === CODE_TYPE);
    expect(offered).toContain("submit_code");
    expect(codeNode?.properties?.code).toBe(IMPROVED_CODE);
  });

  it("leaves the authored body alone when the option is off", async () => {
    const { graph, offered } = await plan(false);
    const codeNode = graph?.nodes.find((node) => node.type === CODE_TYPE);
    expect(offered).not.toContain("submit_code");
    expect(codeNode?.properties?.code).toBe(AUTHORED_CODE);
  });
});
