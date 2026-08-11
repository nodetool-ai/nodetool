/**
 * Sample workflow graphs in the kernel's descriptor shape:
 *   - nodes carry `properties` (not the editor's `data`)
 *   - edges carry `edge_type` ("data" | "control")
 *
 * `RunResult.outputs` is collected from every **terminal** node (a node with no
 * outgoing data edges), keyed by `name ?? id`. So even a single constant node
 * produces a result.
 *
 * Only `@nodetool-ai/protocol` *types* are imported here, so this module is safe
 * to import from a client component (the types are erased at build time).
 */
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

export interface Graph {
  nodes: NodeDescriptor[];
  edges: Edge[];
}

export interface SampleGraph {
  id: string;
  label: string;
  description: string;
  graph: Graph;
}

export const SAMPLE_GRAPHS: SampleGraph[] = [
  {
    id: "hello",
    label: "Hello (constant)",
    description:
      "A single String constant. The simplest terminal node — its value becomes the workflow output.",
    graph: {
      nodes: [
        {
          id: "greeting",
          type: "nodetool.constant.String",
          name: "greeting",
          properties: {
            value: "Hello from a server-side NodeTool workflow runner 👋"
          }
        }
      ],
      edges: []
    }
  },
  {
    id: "repeat-collect",
    label: "Repeat Count → Collect",
    description:
      "Emit 5 sequential ticks, then collect them into a single list. A two-node pipeline connected by a data edge.",
    graph: {
      nodes: [
        {
          id: "ticks",
          type: "nodetool.control.RepeatCount",
          name: "ticks",
          properties: { count: 5 }
        },
        {
          id: "collect",
          type: "nodetool.control.Collect",
          name: "collected"
        }
      ],
      edges: [
        {
          id: "ticks->collect",
          source: "ticks",
          sourceHandle: "output",
          target: "collect",
          targetHandle: "input_item",
          edge_type: "data"
        }
      ]
    }
  },
  {
    id: "openai-websearch",
    label: "OpenAI Web Search (needs key)",
    description:
      "Answer a query with OpenAI's web-search model. The key is read from OPENAI_API_KEY on the server (never the browser). Without the key the run streams a clear 'OPENAI_API_KEY is required' error.",
    graph: {
      nodes: [
        {
          id: "search",
          type: "openai.text.WebSearch",
          name: "answer",
          properties: {
            query: "In one sentence, what is the NodeTool AI workflow platform?"
          }
        }
      ],
      edges: []
    }
  }
];
