/**
 * Built-in evaluation cases for the frontend tool-loop flow.
 *
 * Each case ships a small, self-contained node catalog (so runs are
 * deterministic and need no live registry) plus structural expectations on the
 * tool sequence and the resulting graph. Expectations are deliberately loose on
 * ordering-of-equivalent-calls and strict on outcomes: many tool orderings
 * build a valid graph, but all must add the right node families, wire them, and
 * avoid errors.
 */

import type { NodeMetadata, Property, OutputSlot } from "@nodetool-ai/protocol";
import type {
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "./tool-loop-eval.js";
import {
  createToolLoopBridge,
  type ToolLoopFinalState,
  type HeadlessNode,
  type HeadlessEdge
} from "./tool-loop-bridge.js";

/** Minimal Property with the fields the headless tools read. */
function prop(
  name: string,
  type: string,
  opts: { required?: boolean; default?: unknown } = {}
): Property {
  return {
    name,
    type: { type, optional: !opts.required, type_args: [] },
    default: opts.default ?? null,
    required: opts.required ?? false
  };
}

/** Minimal OutputSlot. */
function out(name: string, type: string): OutputSlot {
  return {
    name,
    type: { type, optional: false, type_args: [] },
    stream: false
  };
}

/** Build a NodeMetadata stub carrying only the fields the tools consult. */
function defineNode(
  node_type: string,
  opts: {
    title?: string;
    description?: string;
    properties?: Property[];
    outputs?: OutputSlot[];
  } = {}
): NodeMetadata {
  const segments = node_type.split(".");
  return {
    title: opts.title ?? segments[segments.length - 1],
    description: opts.description ?? "",
    namespace: segments.slice(0, -1).join("."),
    node_type,
    layout: "default",
    properties: opts.properties ?? [],
    outputs: opts.outputs ?? [out("output", "any")],
    recommended_models: [],
    required_settings: [],
    supports_dynamic_inputs: false,
    is_streaming_output: false,
    supports_dynamic_outputs: false
  };
}

/**
 * Shared catalog: a string input, a couple of text-processing steps, an LLM
 * agent step, and an output node. Enough to express "take input → process →
 * output" objectives via the tool surface.
 */
export const TOOL_LOOP_NODE_CATALOG: Record<string, NodeMetadata> =
  Object.fromEntries(
    [
      defineNode("nodetool.input.StringInput", {
        title: "String Input",
        description: "A workflow input that supplies a string value by name.",
        properties: [
          prop("name", "str", { required: true }),
          prop("value", "str")
        ],
        outputs: [out("output", "str")]
      }),
      defineNode("nodetool.text.Concat", {
        title: "Concat",
        description: "Concatenate two strings into one.",
        properties: [prop("a", "str", { required: true }), prop("b", "str")],
        outputs: [out("output", "str")]
      }),
      defineNode("nodetool.text.FormatText", {
        title: "Format Text",
        description: "Format a template string using named inputs.",
        properties: [
          prop("template", "str", { required: true }),
          prop("text", "str")
        ],
        outputs: [out("output", "str")]
      }),
      defineNode("nodetool.agents.Agent", {
        title: "Agent",
        description:
          "An LLM step: runs a prompt over its input and returns text.",
        properties: [
          prop("prompt", "str", { required: true }),
          prop("input", "str")
        ],
        outputs: [out("output", "str")]
      }),
      defineNode("nodetool.output.StringOutput", {
        title: "String Output",
        description: "Surfaces a string as a named workflow output.",
        properties: [
          prop("name", "str", { required: true }),
          prop("value", "str")
        ],
        outputs: []
      })
    ].map((m) => [m.node_type, m])
  );

/** Count nodes in the final graph whose type starts with `prefix`. */
function countByPrefix(state: ToolLoopFinalState, prefix: string): number {
  return state.nodes.filter((n) => n.type.startsWith(prefix)).length;
}

/** Every non-input node has an incoming edge; every non-output an outgoing one. */
const connectedPredicate: ToolLoopStatePredicate<ToolLoopFinalState> = {
  name: "connected",
  detail: "some node is unwired",
  test: (state) => {
    const hasIn = new Set(state.edges.map((e) => e.target));
    const hasOut = new Set(state.edges.map((e) => e.source));
    return state.nodes.every((n) => {
      const isInput = n.type.startsWith("nodetool.input.");
      const isOutput = n.type.startsWith("nodetool.output.");
      if (!isInput && !hasIn.has(n.id)) return false;
      if (!isOutput && !hasOut.has(n.id)) return false;
      return true;
    });
  }
};

/** Pre-seeded input→agent graph for the `extend-existing` case. */
const EXTEND_SEED_NODES: HeadlessNode[] = [
  {
    id: "in1",
    type: "nodetool.input.StringInput",
    position: { x: 100, y: 100 },
    data: { properties: { name: "text", value: "" } }
  },
  {
    id: "agent1",
    type: "nodetool.agents.Agent",
    position: { x: 360, y: 100 },
    data: { properties: { prompt: "summarize", input: "" } }
  }
];

const EXTEND_SEED_EDGES: HeadlessEdge[] = [
  {
    id: "edge_1",
    source: "in1",
    target: "agent1",
    sourceHandle: "output",
    targetHandle: "input"
  }
];

/** Seeded positions for the `rewire-and-relabel` case, read back by its layout predicate. */
const REWIRE_SEED_POSITIONS: Record<"in1" | "agent1" | "out1", { x: number; y: number }> = {
  in1: { x: 60, y: 60 },
  agent1: { x: 60, y: 260 },
  out1: { x: 60, y: 460 }
};

/**
 * Pre-seeded input→agent→output graph for `rewire-and-relabel`, with the
 * output wired straight from the input (bypassing the agent) and the agent's
 * required `prompt` left empty.
 */
const REWIRE_SEED_NODES: HeadlessNode[] = [
  {
    id: "in1",
    type: "nodetool.input.StringInput",
    position: { ...REWIRE_SEED_POSITIONS.in1 },
    data: { properties: { name: "text", value: "" } }
  },
  {
    id: "agent1",
    type: "nodetool.agents.Agent",
    position: { ...REWIRE_SEED_POSITIONS.agent1 },
    data: { properties: { prompt: "", input: "" } }
  },
  {
    id: "out1",
    type: "nodetool.output.StringOutput",
    position: { ...REWIRE_SEED_POSITIONS.out1 },
    data: { properties: { name: "summary", value: "" } }
  }
];

const REWIRE_SEED_EDGES: HeadlessEdge[] = [
  {
    id: "edge_seed_1",
    source: "in1",
    target: "agent1",
    sourceHandle: "output",
    targetHandle: "input"
  },
  {
    id: "edge_seed_2",
    source: "in1",
    target: "out1",
    sourceHandle: "output",
    targetHandle: "value"
  }
];

export const TOOL_LOOP_EVAL_CASES: readonly ToolLoopEvalCase<ToolLoopFinalState>[] =
  [
    {
      id: "summarize",
      description: "Wire a StringInput → Agent → StringOutput chain via tools",
      objective:
        "Build a workflow that takes a string input named 'text', summarizes it with an LLM agent step, and exposes the summary as a string output named 'summary'. Search for node types, add the nodes, and connect them.",
      createBridge: () =>
        createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG }),
      expect: {
        requiredTools: ["ui_add_node", "ui_connect_nodes"],
        forbiddenTools: ["ui_delete_node"],
        ordering: [["ui_add_node", "ui_connect_nodes"]],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 20,
        finalState: [
          {
            name: "hasInput",
            detail: "no nodetool.input.* node",
            test: (s) => countByPrefix(s, "nodetool.input.") >= 1
          },
          {
            name: "hasAgent",
            detail: "no nodetool.agents.* node",
            test: (s) => countByPrefix(s, "nodetool.agents.") >= 1
          },
          {
            name: "hasOutput",
            detail: "no nodetool.output.* node",
            test: (s) => countByPrefix(s, "nodetool.output.") >= 1
          },
          {
            name: "minEdges",
            detail: "fewer than 2 edges",
            test: (s) => s.edges.length >= 2
          },
          connectedPredicate
        ]
      }
    },
    {
      id: "extend-existing",
      description: "Add an output to a pre-seeded input→agent graph",
      objective:
        "The workflow already has a StringInput ('text', id=in1) feeding an Agent (id=agent1). Add a StringOutput node named 'result' and connect the agent's output to it so the result is surfaced.",
      userPrompt:
        "Objective: The workflow already has a StringInput ('text', id=in1) feeding an Agent (id=agent1). Add a StringOutput node named 'result' and connect the agent's output to it so the result is surfaced.\n\nThe workflow already contains 2 node(s); build on top of them.",
      createBridge: () =>
        createToolLoopBridge({
          nodeMetadata: TOOL_LOOP_NODE_CATALOG,
          nodes: EXTEND_SEED_NODES,
          edges: EXTEND_SEED_EDGES
        }),
      expect: {
        requiredTools: ["ui_add_node", "ui_connect_nodes"],
        ordering: [["ui_add_node", "ui_connect_nodes"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasOutput",
            detail: "no nodetool.output.* node added",
            test: (s) => countByPrefix(s, "nodetool.output.") >= 1
          },
          {
            name: "agentWired",
            detail: "agent1 output not connected onward",
            test: (s) => s.edges.some((e) => e.source === "agent1")
          }
        ]
      }
    },
    {
      id: "rewire-and-relabel",
      description:
        "Read a seeded graph, fill an unset required property, delete a bypass edge, rewire through the agent, retitle every node, and reposition them",
      objective:
        "This workflow already has a StringInput ('text', id=in1) feeding an Agent step (id=agent1), whose prompt property is empty. The StringOutput (id=out1) is currently wired directly from in1, bypassing the agent entirely. Inspect the current graph first, then fix it: fill in agent1's prompt with a real instruction (e.g. 'Summarize the input text'); delete the edge that connects in1 straight to out1; connect agent1's output to out1 so the summary reaches the output instead; give in1, agent1 and out1 clearer titles describing what each one does; and reposition the three nodes into a clearer left-to-right layout.",
      createBridge: () =>
        createToolLoopBridge({
          nodeMetadata: TOOL_LOOP_NODE_CATALOG,
          nodes: REWIRE_SEED_NODES,
          edges: REWIRE_SEED_EDGES
        }),
      expect: {
        requiredTools: [
          "ui_get_graph",
          "ui_update_node_data",
          "ui_delete_edge",
          "ui_connect_nodes",
          "ui_move_node",
          "ui_set_node_title"
        ],
        ordering: [
          ["ui_get_graph", "ui_delete_edge"],
          ["ui_get_graph", "ui_update_node_data"]
        ],
        noErrorResults: true,
        minToolCalls: 6,
        maxToolCalls: 30,
        finalState: [
          {
            name: "promptFilled",
            detail: "agent1's prompt property is still empty",
            test: (s) => {
              const agent = s.nodes.find((n) => n.id === "agent1");
              const value = agent?.data.properties.prompt;
              return typeof value === "string" && value.trim().length > 0;
            }
          },
          {
            name: "bypassEdgeRemoved",
            detail: "the seeded in1 -> out1 bypass edge is still present",
            test: (s) =>
              !s.edges.some((e) => e.source === "in1" && e.target === "out1")
          },
          {
            name: "agentWiredToOutput",
            detail: "agent1's output is not connected to out1's value input",
            test: (s) =>
              s.edges.some(
                (e) =>
                  e.source === "agent1" &&
                  e.target === "out1" &&
                  e.targetHandle === "value"
              )
          },
          {
            name: "nodesRepositioned",
            detail: "one or more seeded nodes were not moved from their seeded position",
            test: (s) =>
              (["in1", "agent1", "out1"] as const).every((id) => {
                const node = s.nodes.find((n) => n.id === id);
                if (!node) return false;
                const seed = REWIRE_SEED_POSITIONS[id];
                return (
                  Math.hypot(
                    node.position.x - seed.x,
                    node.position.y - seed.y
                  ) > 40
                );
              })
          },
          {
            name: "titlesSet",
            detail: "in1, agent1 and out1 were not all given titles",
            test: (s) =>
              (["in1", "agent1", "out1"] as const).every((id) => {
                const node = s.nodes.find((n) => n.id === id);
                return !!node?.data.title && node.data.title.trim().length > 0;
              })
          }
        ]
      }
    }
  ];
