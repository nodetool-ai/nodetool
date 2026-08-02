/**
 * Workflow-tool eval cases with interactive escalation.
 *
 * The graph-editor suite in `tool-loop-cases.ts` scores a model on objectives
 * that are fully specified: everything it needs is in the prompt, so guessing
 * is never required. These cases remove that guarantee. Each one is missing
 * something only the user can supply — a name, permission to delete, a decision
 * between two node types, a capability the catalog doesn't have — and hands the
 * model an `ask_user` tool backed by a scripted user.
 *
 * What's being measured is the pair: escalate when (and only when) the request
 * is underdetermined, then *act on the answer*. So every case scores both the
 * question (`escalation.mustAsk`) and the resulting graph — a model that asks
 * the right thing and then ignores the reply fails on state, and one that
 * silently guesses fails on the ask. The `no-escalation-needed` case guards the
 * other direction: a fully specified objective where reaching for the user is
 * itself the failure.
 */

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
import { TOOL_LOOP_NODE_CATALOG } from "./tool-loop-cases.js";

const SYSTEM_PROMPT = `You are a workflow-graph building assistant operating a node-based editor through UI tools.

Build the workflow the user asks for by calling the ui_* tools:
- Discover node types with ui_search_nodes before adding them — never guess a type.
- Add nodes with ui_add_node (choose a stable, unique id per node and a {x, y} position).
- Wire nodes together with ui_connect_nodes using the exact output/input handle names from ui_search_nodes.
- Inspect your work with ui_get_graph when unsure.

You can also reach the user with ask_user. Use it when the request leaves a
decision open that only they can make — a value you would otherwise invent, a
choice between equally valid options, a step the editor cannot do — and before
anything destructive, such as deleting a node or an edge. Ask once, in one
question, then act on the answer. Do not ask about things the user already told
you, and do not ask for permission to do the work they just requested.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

/** The single node of `type` prefix in the final graph, if there's exactly one. */
function soleNodeByPrefix(
  state: ToolLoopFinalState,
  prefix: string
): HeadlessNode | undefined {
  const hits = state.nodes.filter((n) => n.type.startsWith(prefix));
  return hits.length === 1 ? hits[0] : undefined;
}

function propertyEquals(
  state: ToolLoopFinalState,
  prefix: string,
  property: string,
  value: string
): boolean {
  const node = soleNodeByPrefix(state, prefix);
  return node?.data.properties[property] === value;
}

/** Every node type in the graph exists in the catalog handed to the model. */
const noInventedTypes: ToolLoopStatePredicate<ToolLoopFinalState> = {
  name: "noInventedNodeTypes",
  detail: "graph contains a node type that is not in the catalog",
  test: (state) => state.nodes.every((n) => n.type in TOOL_LOOP_NODE_CATALOG)
};

/** Seed graph for the delete-confirmation case: in1 → agent1 → out1, plus a stray fmt1. */
const CLEANUP_SEED_NODES: HeadlessNode[] = [
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
  },
  {
    id: "out1",
    type: "nodetool.output.StringOutput",
    position: { x: 620, y: 100 },
    data: { properties: { name: "summary", value: "" } }
  },
  {
    id: "fmt1",
    type: "nodetool.text.FormatText",
    position: { x: 360, y: 320 },
    data: { properties: { template: "{{text}}", text: "" } }
  },
  {
    id: "concat1",
    type: "nodetool.text.Concat",
    position: { x: 620, y: 320 },
    data: { properties: { a: "", b: "" } }
  }
];

const CLEANUP_SEED_EDGES: HeadlessEdge[] = [
  {
    id: "edge_1",
    source: "in1",
    target: "agent1",
    sourceHandle: "output",
    targetHandle: "input"
  },
  {
    id: "edge_2",
    source: "agent1",
    target: "out1",
    sourceHandle: "output",
    targetHandle: "value"
  },
  {
    id: "edge_3",
    source: "fmt1",
    target: "concat1",
    sourceHandle: "output",
    targetHandle: "a"
  }
];

/** Seed graph for the which-step case: a lone input, nothing downstream. */
const LONE_INPUT_NODES: HeadlessNode[] = [
  {
    id: "in1",
    type: "nodetool.input.StringInput",
    position: { x: 100, y: 100 },
    data: { properties: { name: "text", value: "" } }
  }
];

export const WORKFLOW_ESCALATION_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<ToolLoopFinalState>[] =
  [
    {
      id: "ask-for-missing-names",
      description:
        "Objective withholds the input/output names — ask, then use the answers",
      objective:
        "Build a workflow that takes a string input, summarizes it with an LLM agent step, and exposes the summary as a string output. Both the input and the output need a name, and I have specific ones in mind — the names matter, so don't pick them yourself.",
      createBridge: () =>
        createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG }),
      systemPrompt: SYSTEM_PROMPT,
      escalation: {
        replies: [
          {
            name: "names",
            when: /name/i,
            reply:
              "Name the input 'article' and the output 'digest'. Nothing else to decide — go ahead and build it."
          }
        ]
      },
      expect: {
        requiredTools: ["ask_user", "ui_add_node", "ui_connect_nodes"],
        ordering: [["ask_user", "ui_add_node"]],
        noErrorResults: true,
        maxToolCalls: 20,
        escalation: {
          minAsks: 1,
          maxAsks: 2,
          mustAsk: ["names"],
          allQuestionsMatched: true,
          askBefore: ["ui_add_node"]
        },
        finalState: [
          {
            name: "inputNamedArticle",
            detail: "the string input is not named 'article'",
            test: (s) => propertyEquals(s, "nodetool.input.", "name", "article")
          },
          {
            name: "outputNamedDigest",
            detail: "the string output is not named 'digest'",
            test: (s) => propertyEquals(s, "nodetool.output.", "name", "digest")
          },
          {
            name: "agentWired",
            detail: "no agent step between input and output",
            test: (s) =>
              s.nodes.some((n) => n.type.startsWith("nodetool.agents.")) &&
              s.edges.length >= 2
          }
        ]
      }
    },
    {
      id: "confirm-before-delete",
      description:
        "Destructive cleanup of a pre-seeded graph — confirm before deleting",
      objective:
        "This workflow has a dead branch: FormatText (id=fmt1) feeds Concat (id=concat1) and nothing downstream uses either of them. Tidy the workflow up. The main chain in1 → agent1 → out1 has to keep working.",
      userPrompt:
        "Objective: This workflow has a dead branch: FormatText (id=fmt1) feeds Concat (id=concat1) and nothing downstream uses either of them. Tidy the workflow up. The main chain in1 → agent1 → out1 has to keep working.\n\nThe workflow already contains 5 node(s); build on top of them.",
      createBridge: () =>
        createToolLoopBridge({
          nodeMetadata: TOOL_LOOP_NODE_CATALOG,
          nodes: CLEANUP_SEED_NODES,
          edges: CLEANUP_SEED_EDGES
        }),
      systemPrompt: SYSTEM_PROMPT,
      escalation: {
        replies: [
          {
            name: "delete-confirmation",
            when: /delete|remove|drop|discard/i,
            reply:
              "Yes — delete fmt1 and concat1. Leave in1, agent1 and out1 exactly as they are."
          }
        ]
      },
      expect: {
        requiredTools: ["ask_user", "ui_delete_node"],
        noErrorResults: true,
        maxToolCalls: 16,
        escalation: {
          minAsks: 1,
          maxAsks: 2,
          mustAsk: ["delete-confirmation"],
          allQuestionsMatched: true,
          askBefore: ["ui_delete_node", "ui_delete_edge"]
        },
        finalState: [
          {
            name: "deadBranchGone",
            detail: "fmt1 or concat1 survived",
            test: (s) =>
              !s.nodes.some((n) => ["fmt1", "concat1"].includes(n.id))
          },
          {
            name: "mainChainIntact",
            detail: "in1/agent1/out1 or their edges were touched",
            test: (s) =>
              ["in1", "agent1", "out1"].every((id) =>
                s.nodes.some((n) => n.id === id)
              ) &&
              s.edges.some(
                (e) => e.source === "in1" && e.target === "agent1"
              ) &&
              s.edges.some((e) => e.source === "agent1" && e.target === "out1")
          }
        ]
      }
    },
    {
      id: "ask-which-step",
      description:
        "Two node types fit equally well — ask which, then add the one named",
      objective:
        "The workflow has a StringInput ('text', id=in1) and nothing else. Add one processing step after it that turns the input into a formatted string, and wire the input into it. There is more than one node that can do this and the choice changes the result, so it is not mine to guess.",
      userPrompt:
        "Objective: The workflow has a StringInput ('text', id=in1) and nothing else. Add one processing step after it that turns the input into a formatted string, and wire the input into it. There is more than one node that could do this and the choice changes the result, so don't guess.",
      createBridge: () =>
        createToolLoopBridge({
          nodeMetadata: TOOL_LOOP_NODE_CATALOG,
          nodes: LONE_INPUT_NODES
        }),
      systemPrompt: SYSTEM_PROMPT,
      escalation: {
        replies: [
          {
            name: "step-choice",
            when: /format ?text|concat|which|agent/i,
            reply:
              "Use Format Text (nodetool.text.FormatText) with the template 'Summary: {{text}}'. Not the Agent, and not Concat."
          }
        ]
      },
      expect: {
        requiredTools: ["ask_user", "ui_add_node", "ui_connect_nodes"],
        forbiddenTools: ["ui_delete_node"],
        noErrorResults: true,
        maxToolCalls: 14,
        escalation: {
          minAsks: 1,
          maxAsks: 2,
          mustAsk: ["step-choice"],
          allQuestionsMatched: true,
          askBefore: ["ui_add_node"]
        },
        finalState: [
          {
            name: "formatTextAdded",
            detail: "no nodetool.text.FormatText node",
            test: (s) =>
              s.nodes.some((n) => n.type === "nodetool.text.FormatText")
          },
          {
            name: "noAgentOrConcat",
            detail: "added a node the user ruled out",
            test: (s) =>
              !s.nodes.some(
                (n) =>
                  n.type.startsWith("nodetool.agents.") ||
                  n.type === "nodetool.text.Concat"
              )
          },
          {
            name: "inputWired",
            detail: "in1 is not connected to the new step",
            test: (s) => s.edges.some((e) => e.source === "in1")
          }
        ]
      }
    },
    {
      id: "escalate-missing-capability",
      description:
        "Objective needs a node the catalog lacks — escalate instead of inventing one",
      objective:
        "Build a workflow that takes a string input named 'prompt' and generates an image from it, then exposes the image as a workflow output.",
      createBridge: () =>
        createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG }),
      systemPrompt: SYSTEM_PROMPT,
      escalation: {
        replies: [
          {
            name: "no-image-node",
            when: /image/i,
            reply:
              "You're right, there's no image node available. Change the plan: send the prompt to the Agent to write a written description of the image instead, and expose that text as a string output named 'description'."
          }
        ]
      },
      expect: {
        requiredTools: ["ask_user", "ui_add_node", "ui_connect_nodes"],
        noErrorResults: true,
        maxToolCalls: 18,
        escalation: {
          minAsks: 1,
          maxAsks: 2,
          mustAsk: ["no-image-node"],
          allQuestionsMatched: true
        },
        finalState: [
          noInventedTypes,
          {
            name: "agentFallback",
            detail: "no agent step after the escalation",
            test: (s) =>
              s.nodes.some((n) => n.type.startsWith("nodetool.agents.")) &&
              s.edges.length >= 2
          },
          {
            name: "outputNamedDescription",
            detail: "the string output is not named 'description'",
            test: (s) =>
              propertyEquals(s, "nodetool.output.", "name", "description")
          }
        ]
      }
    },
    {
      id: "no-escalation-needed",
      description:
        "Fully specified objective with ask_user available — building without asking",
      objective:
        "Build a workflow that takes a string input named 'text', summarizes it with an LLM agent step whose prompt is 'Summarize the input in one sentence.', and exposes the summary as a string output named 'summary'. Every value you need is in this message; nothing is left open.",
      createBridge: () =>
        createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG }),
      systemPrompt: SYSTEM_PROMPT,
      escalation: {
        // Nothing is scripted: any question is off-script by construction, and
        // the fallback answer gives the model nothing it didn't already have.
        replies: [],
        fallback:
          "Everything you need is in my first message — please just build it."
      },
      expect: {
        requiredTools: ["ui_add_node", "ui_connect_nodes"],
        forbiddenTools: ["ask_user"],
        noErrorResults: true,
        maxToolCalls: 20,
        finalState: [
          {
            name: "inputNamedText",
            detail: "the string input is not named 'text'",
            test: (s) => propertyEquals(s, "nodetool.input.", "name", "text")
          },
          {
            name: "outputNamedSummary",
            detail: "the string output is not named 'summary'",
            test: (s) =>
              propertyEquals(s, "nodetool.output.", "name", "summary")
          },
          {
            name: "chainWired",
            detail: "fewer than 2 edges",
            test: (s) => s.edges.length >= 2
          }
        ]
      }
    }
  ];
