/**
 * Unit tests for the tool-loop eval harness (`src/evals/tool-loop-*`):
 *   - `checkToolLoopExpectations`: pure structural scoring, no provider.
 *   - `createToolLoopBridge`: headless execution of the real ui_* tool contract.
 *   - `runToolLoopEval`: metrics collection + scoring driven by a scripted
 *     provider that emulates a model's native tool loop — no network.
 */
import { describe, it, expect } from "vitest";
import {
  runToolLoopEval,
  formatToolLoopReport,
  checkToolLoopExpectations,
  createToolLoopBridge,
  type ToolLoopEvalCase,
  type ToolLoopObservation,
  type ToolLoopFinalState
} from "../src/index.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import type { NodeMetadata, Property, OutputSlot } from "@nodetool-ai/protocol";

// --- catalog helpers ---------------------------------------------------------

function prop(name: string, required = false): Property {
  return {
    name,
    type: { type: "str", optional: !required, type_args: [] },
    default: null,
    required
  };
}
function out(name: string): OutputSlot {
  return { name, type: { type: "str", optional: false, type_args: [] }, stream: false };
}
function node(node_type: string, properties: Property[], outputs: OutputSlot[]): NodeMetadata {
  return {
    title: node_type,
    description: "",
    namespace: "",
    node_type,
    layout: "default",
    properties,
    outputs,
    recommended_models: [],
    required_settings: [],
    supports_dynamic_inputs: false,
    is_streaming_output: false,
    supports_dynamic_outputs: false
  } as NodeMetadata;
}

const CATALOG: Record<string, NodeMetadata> = {
  "nodetool.input.StringInput": node(
    "nodetool.input.StringInput",
    [prop("name", true), prop("value")],
    [out("output")]
  ),
  "nodetool.agents.Agent": node(
    "nodetool.agents.Agent",
    [prop("prompt", true), prop("input")],
    [out("output")]
  ),
  "nodetool.output.StringOutput": node(
    "nodetool.output.StringOutput",
    [prop("name", true), prop("value")],
    []
  )
};

// --- scripted provider -------------------------------------------------------

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider that replays one scripted list of tool calls through the tool
 * `execute` closures (mirroring how a real provider's `generateLoop` dispatches
 * self-executing tools), then ends the turn.
 */
function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

// The happy-path transcript: search, add three nodes, wire two edges.
const GOOD_SCRIPT: ScriptedCall[] = [
  { name: "ui_search_nodes", args: { query: "input" } },
  {
    name: "ui_add_node",
    args: {
      id: "in1",
      type: "nodetool.input.StringInput",
      position: { x: 0, y: 0 },
      properties: { name: "text" }
    }
  },
  {
    name: "ui_add_node",
    args: {
      id: "agent1",
      type: "nodetool.agents.Agent",
      position: { x: 240, y: 0 },
      properties: { prompt: "summarize" }
    }
  },
  {
    name: "ui_add_node",
    args: {
      id: "out1",
      type: "nodetool.output.StringOutput",
      position: { x: 480, y: 0 },
      properties: { name: "summary" }
    }
  },
  {
    name: "ui_connect_nodes",
    args: {
      source_node_id: "in1",
      source_handle: "output",
      target_node_id: "agent1",
      target_handle: "input"
    }
  },
  {
    name: "ui_connect_nodes",
    args: {
      source_node_id: "agent1",
      source_handle: "output",
      target_node_id: "out1",
      target_handle: "value"
    }
  }
];

const GOOD_CASE: ToolLoopEvalCase = {
  id: "good",
  description: "builds a full chain",
  objective: "Take input text, summarize, output it.",
  createBridge: () => createToolLoopBridge({ nodeMetadata: CATALOG }),
  expect: {
    requiredTools: ["ui_add_node", "ui_connect_nodes"],
    forbiddenTools: ["ui_delete_node"],
    ordering: [["ui_add_node", "ui_connect_nodes"]],
    noErrorResults: true,
    minToolCalls: 3,
    maxToolCalls: 20,
    finalState: [
      {
        name: "threeNodes",
        test: (s) => s.nodes.length === 3
      },
      {
        name: "twoEdges",
        test: (s) => s.edges.length === 2
      }
    ]
  }
};

const NEEDS_MODELS_CASE: ToolLoopEvalCase = {
  id: "needs-models",
  description: "skipped without providers",
  objective: "Pick a model.",
  needsModelProviders: true,
  createBridge: () => createToolLoopBridge({ nodeMetadata: CATALOG }),
  expect: {}
};

// --- runToolLoopEval ---------------------------------------------------------

describe("runToolLoopEval", () => {
  it("collects metrics, scores expectations, and skips model-dependent cases", async () => {
    const provider = createScriptedProvider(GOOD_SCRIPT);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [GOOD_CASE, NEEDS_MODELS_CASE]
    });

    expect(report.provider).toBe("scripted");
    expect(report.cases).toHaveLength(2);

    const good = report.cases[0];
    expect(good.accepted).toBe(true);
    expect(good.score).toBe(1);
    expect(good.checks.every((c) => c.pass)).toBe(true);
    expect(good.toolCalls["ui_add_node"]).toBe(3);
    expect(good.toolCalls["ui_connect_nodes"]).toBe(2);
    expect(good.totalToolCalls).toBe(6);

    const skipped = report.cases[1];
    expect(skipped.skipped).toBe(true);

    expect(report.summary.total).toBe(2);
    expect(report.summary.skipped).toBe(1);
    expect(report.summary.accepted).toBe(1);
    expect(report.summary.successRate).toBe(1);
    expect(report.summary.avgToolCalls).toBe(6);
    expect(report.summary.totalCostUsd).toBe(0);
  });

  it("penalizes error results and violated expectations", async () => {
    // Adds a node with an unknown type (errors) and never connects anything.
    const badScript: ScriptedCall[] = [
      {
        name: "ui_add_node",
        args: { id: "x", type: "does.not.Exist", position: { x: 0, y: 0 } }
      }
    ];
    const provider = createScriptedProvider(badScript);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [GOOD_CASE]
    });
    const r = report.cases[0];
    // The loop still ran to completion, so it is "accepted"...
    expect(r.accepted).toBe(true);
    // ...but many checks fail: no connect, error result, too few calls.
    expect(r.score).toBeLessThan(1);
    const byName = Object.fromEntries(r.checks.map((c) => [c.name, c.pass]));
    expect(byName["no-error-results"]).toBe(false);
    expect(byName["tool:ui_connect_nodes"]).toBe(false);
  });

  it("formats a readable report", async () => {
    const provider = createScriptedProvider(GOOD_SCRIPT);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [GOOD_CASE]
    });
    const text = formatToolLoopReport(report);
    expect(text).toContain("provider=scripted model=test-model");
    expect(text).toContain("good");
    expect(text).toContain("success 1/1 (100%)");
  });
});

// --- createToolLoopBridge ----------------------------------------------------

describe("createToolLoopBridge", () => {
  it("executes the real tool contract headlessly and mutates the graph", async () => {
    const bridge = createToolLoopBridge({ nodeMetadata: CATALOG });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_add_node"].execute({
      id: "in1",
      type: "nodetool.input.StringInput",
      position: { x: 0, y: 0 },
      properties: { name: "text" }
    });
    await byName["ui_add_node"].execute({
      id: "agent1",
      type: "nodetool.agents.Agent",
      position: { x: 240, y: 0 },
      properties: { prompt: "hi" }
    });
    const connectResult = (await byName["ui_connect_nodes"].execute({
      source_node_id: "in1",
      source_handle: "output",
      target_node_id: "agent1",
      target_handle: "input"
    })) as { ok: boolean; edge_id: string };

    expect(connectResult.ok).toBe(true);
    const final = bridge.finalState();
    expect(final.nodes).toHaveLength(2);
    expect(final.edges).toHaveLength(1);
    expect(final.edges[0].source).toBe("in1");
  });

  it("rejects unknown node types and invalid handles", async () => {
    const bridge = createToolLoopBridge({ nodeMetadata: CATALOG });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await expect(
      byName["ui_add_node"].execute({
        id: "x",
        type: "no.such.Node",
        position: { x: 0, y: 0 }
      })
    ).rejects.toThrow(/Node type not found/);

    await byName["ui_add_node"].execute({
      id: "in1",
      type: "nodetool.input.StringInput",
      position: { x: 0, y: 0 },
      properties: { name: "t" }
    });
    await byName["ui_add_node"].execute({
      id: "agent1",
      type: "nodetool.agents.Agent",
      position: { x: 1, y: 0 },
      properties: { prompt: "p" }
    });
    await expect(
      byName["ui_connect_nodes"].execute({
        source_node_id: "in1",
        source_handle: "not_a_handle",
        target_node_id: "agent1",
        target_handle: "input"
      })
    ).rejects.toThrow(/Source handle .* not found/);
  });

  it("prevents cycles", async () => {
    const bridge = createToolLoopBridge({
      nodeMetadata: CATALOG,
      nodes: [
        {
          id: "a",
          type: "nodetool.agents.Agent",
          position: { x: 0, y: 0 },
          data: { properties: {} }
        },
        {
          id: "b",
          type: "nodetool.agents.Agent",
          position: { x: 1, y: 0 },
          data: { properties: {} }
        }
      ],
      edges: [
        {
          id: "edge_1",
          source: "a",
          target: "b",
          sourceHandle: "output",
          targetHandle: "input"
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await expect(
      byName["ui_connect_nodes"].execute({
        source_node_id: "b",
        source_handle: "output",
        target_node_id: "a",
        target_handle: "input"
      })
    ).rejects.toThrow(/cycle/);
  });
});

// --- checkToolLoopExpectations (pure) ---------------------------------------

function observation(
  names: string[],
  opts: {
    errors?: string[];
    nodes?: number;
    edges?: number;
  } = {}
): ToolLoopObservation<ToolLoopFinalState> {
  const errorSet = new Set(opts.errors ?? []);
  return {
    toolCalls: names.map((name) => ({
      name,
      args: {},
      result: {},
      isError: errorSet.has(name)
    })),
    finalState: {
      nodes: Array.from({ length: opts.nodes ?? 0 }, (_, i) => ({
        id: `n${i}`,
        type: "nodetool.agents.Agent",
        position: { x: 0, y: 0 },
        data: { properties: {} }
      })),
      edges: Array.from({ length: opts.edges ?? 0 }, (_, i) => ({
        id: `e${i}`,
        source: "a",
        target: "b",
        sourceHandle: "output",
        targetHandle: "input"
      }))
    }
  };
}

describe("checkToolLoopExpectations", () => {
  it("passes required/forbidden/ordering/budget/state/no-error when satisfied", () => {
    const checks = checkToolLoopExpectations(
      observation(["ui_add_node", "ui_add_node", "ui_connect_nodes"], {
        nodes: 2,
        edges: 1
      }),
      {
        requiredTools: ["ui_add_node", "ui_connect_nodes"],
        forbiddenTools: ["ui_delete_node"],
        ordering: [["ui_add_node", "ui_connect_nodes"]],
        minToolCalls: 2,
        maxToolCalls: 5,
        noErrorResults: true,
        finalState: [{ name: "wired", test: (s) => s.edges.length === 1 }]
      }
    );
    expect(checks.every((c) => c.pass)).toBe(true);
    expect(checks.map((c) => c.name)).toEqual([
      "tool:ui_add_node",
      "tool:ui_connect_nodes",
      "not-tool:ui_delete_node",
      "order:ui_add_node<ui_connect_nodes",
      "state:wired",
      "toolCalls>=2",
      "toolCalls<=5",
      "no-error-results"
    ]);
  });

  it("flags missing required tools, forbidden calls, bad ordering, and errors", () => {
    const checks = checkToolLoopExpectations(
      observation(["ui_connect_nodes", "ui_delete_node", "ui_add_node"], {
        errors: ["ui_connect_nodes"]
      }),
      {
        requiredTools: ["ui_search_nodes"],
        forbiddenTools: ["ui_delete_node"],
        ordering: [["ui_add_node", "ui_connect_nodes"]],
        maxToolCalls: 2,
        noErrorResults: true
      }
    );
    const byName = Object.fromEntries(checks.map((c) => [c.name, c.pass]));
    expect(byName["tool:ui_search_nodes"]).toBe(false);
    expect(byName["not-tool:ui_delete_node"]).toBe(false);
    // add_node came AFTER connect_nodes, so ordering fails.
    expect(byName["order:ui_add_node<ui_connect_nodes"]).toBe(false);
    expect(byName["toolCalls<=2"]).toBe(false);
    expect(byName["no-error-results"]).toBe(false);
  });

  it("fails a final-state predicate that throws, surfacing the error", () => {
    const checks = checkToolLoopExpectations(observation([]), {
      finalState: [
        {
          name: "boom",
          test: () => {
            throw new Error("kaboom");
          }
        }
      ]
    });
    expect(checks[0].pass).toBe(false);
    expect(checks[0].detail).toContain("kaboom");
  });

  it("returns no checks for empty expectations", () => {
    expect(checkToolLoopExpectations(observation([]), {})).toEqual([]);
  });
});
