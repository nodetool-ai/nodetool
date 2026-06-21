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
    id: "range-repeat",
    label: "Range → Repeat Each",
    description:
      "Build [0,1,2,3,4], then repeat each item twice. A two-node pipeline connected by a data edge.",
    graph: {
      nodes: [
        {
          id: "range",
          type: "nodetool.list.Range",
          name: "range",
          properties: { start: 0, stop: 5, step: 1 }
        },
        {
          id: "repeat",
          type: "nodetool.list.RepeatEach",
          name: "repeated",
          properties: { times: 2 }
        }
      ],
      edges: [
        {
          id: "range->repeat",
          source: "range",
          sourceHandle: "output",
          target: "repeat",
          targetHandle: "input_list",
          edge_type: "data"
        }
      ]
    }
  },
  {
    id: "openai-websearch",
    label: "OpenAI Web Search (needs key)",
    description:
      "Answer a query with OpenAI's web-search model. The key is read from OPENAI_API_KEY in the Worker env (never the browser). Without the key the run streams a clear 'OPENAI_API_KEY is not configured' error.",
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
