/**
 * "List generator" tutorial cast.
 *
 * A topic flows into an LLM that streams a list, which renders in a preview —
 * showing how a single prompt can fan out into structured, multi-item output.
 * Fully synthetic: fabricated metadata, streamed text, no backend.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.TextInput";
const LIST_TYPE = "nodetool.llm.ListGenerator";

const WF = "wf-list-generator";
const JOB = "list-generator-job";
const m = castMessages(WF, JOB);

const TOPIC = "weekend trip ideas";
const ITEMS = [
  "1. Lakeside cabin getaway\n",
  "2. City food & art tour\n",
  "3. Coastal road trip\n",
  "4. Mountain sunrise hike\n",
  "5. Vineyard & spa retreat\n",
];
const LIST = ITEMS.join("");

const workflow = {
  id: WF,
  name: "List Generator",
  access: "private",
  description: "Topic → Generate List → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("topic", INPUT_TYPE, 0, 150, 250, "Topic", { name: "topic", text: TOPIC }),
      node("list", LIST_TYPE, 380, 150, 300, "Generate List", { prompt: "" }),
      node("preview", PREVIEW_NODE_TYPE, 820, 150, 320, "Preview", {}),
    ],
    edges: [
      edge("e1", "topic", "text", "list", "prompt"),
      edge("e2", "list", "text", "preview", "value"),
    ],
  },
} as unknown as Workflow;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) A topic feeds the generator.
  m.nodeUpdate(150, "topic", "Topic", INPUT_TYPE, "running"),
  m.nodeUpdate(600, "topic", "Topic", INPUT_TYPE, "completed", { text: TOPIC }),
  m.edgeUpdate(700, "e1", "active"),

  // 2) The LLM streams a numbered list, item by item.
  m.nodeUpdate(1000, "list", "Generate List", LIST_TYPE, "running"),
  ...m.stream("list", ITEMS, 1300, 6700),
  m.nodeUpdate(8300, "list", "Generate List", LIST_TYPE, "completed", { text: LIST }),
  m.edgeUpdate(8450, "e1", "completed"),
  m.edgeUpdate(8600, "e2", "active"),

  // 3) Preview shows the finished list.
  m.nodeUpdate(8900, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(9200, "preview", "Preview", "value", LIST, "string"),
  m.nodeUpdate(9600, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: LIST }),
  m.edgeUpdate(9800, "e2", "completed"),
  m.jobUpdate(10000, "completed", { outputs: { value: LIST } }),
];

export const listGeneratorCast: DemoCast = {
  version: CAST_VERSION,
  id: "list-generator",
  name: "List Generator",
  description: "Turn one topic into a structured list with a single LLM node.",
  createdAt: new Date(0).toISOString(),
  durationMs: 13000,
  fps: 30,
  workflow,
  metadata: {
    [INPUT_TYPE]: meta({
      node_type: INPUT_TYPE,
      title: "Topic",
      properties: [prop("text", "str")],
      outputs: [out("text", "str")],
      inline_fields: ["text"],
    }),
    [LIST_TYPE]: meta({
      node_type: LIST_TYPE,
      title: "Generate List",
      properties: [prop("prompt", "str")],
      outputs: [out("text", "str", true)],
      inline_fields: ["prompt"],
      is_streaming_output: true,
    }),
    [PREVIEW_NODE_TYPE]: meta({
      node_type: PREVIEW_NODE_TYPE,
      title: "Preview",
      properties: [prop("value", "any")],
      outputs: [out("output", "any")],
    }),
  },
  events,
  assets: [],
  // Frames the three-node row (graph bbox ~x[0,1140] y[150,420]) in 1920×1080.
  viewport: { x: 360, y: 300, zoom: 0.95 },
};
