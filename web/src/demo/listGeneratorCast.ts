/**
 * "List generator" tutorial cast.
 *
 * A topic flows into the real `nodetool.generators.ListGenerator`, which streams
 * a list of strings — one `item` (+ `index`) per step. The node renders with its
 * own bespoke body (`ListGeneratorBody`): a numbered, scrollable list that fills
 * in live as each item arrives. The whole list then lands in a Preview.
 *
 * The list body reads the node's output-stream buffer, so each item is replayed
 * as an `output_update` on the `item`/`index` handles (mirroring a real run),
 * not as text chunks. Fully synthetic: real metadata, fabricated items, no
 * backend.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.StringInput";
const LIST_TYPE = "nodetool.generators.ListGenerator";

const WF = "wf-list-generator";
const JOB = "list-generator-job";
const m = castMessages(WF, JOB);

const TOPIC = "weekend trip ideas";
// Clean item strings — the bespoke list body supplies the numbered badges, so
// no "1." prefix or trailing newline here.
const ITEMS = [
  "Lakeside cabin getaway",
  "City food & art tour",
  "Coastal road trip",
  "Mountain sunrise hike",
  "Vineyard & spa retreat",
];

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
      node("topic", INPUT_TYPE, 0, 150, 250, "Topic", { name: "topic", value: TOPIC }),
      node("list", LIST_TYPE, 380, 150, 300, "Generate List", { prompt: TOPIC }),
      node("preview", PREVIEW_NODE_TYPE, 820, 150, 320, "Preview", {}),
    ],
    edges: [
      edge("e1", "topic", "output", "list", "prompt"),
      edge("e2", "list", "output", "preview", "value"),
    ],
  },
} as unknown as Workflow;

/** Stream the list items as item/index output_updates across [start, start+span]. */
function streamItems(start: number, span: number): CastEvent[] {
  const events: CastEvent[] = [];
  ITEMS.forEach((item, i) => {
    const t = Math.round(start + (span * i) / ITEMS.length);
    events.push(m.output(t, "list", "Generate List", "item", item, "str"));
    events.push(m.output(t + 20, "list", "Generate List", "index", i, "int"));
  });
  return events;
}

// Slowed down so each streamed item is readable as it arrives.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) A topic feeds the generator.
  m.nodeUpdate(300, "topic", "Topic", INPUT_TYPE, "running"),
  m.nodeUpdate(1400, "topic", "Topic", INPUT_TYPE, "completed", { output: TOPIC }),
  m.edgeUpdate(1700, "e1", "active"),

  // 2) The generator streams a list, item by item, into its bespoke list body.
  m.nodeUpdate(2400, "list", "Generate List", LIST_TYPE, "running"),
  ...streamItems(2900, 7200),
  m.nodeUpdate(10800, "list", "Generate List", LIST_TYPE, "completed", { output: ITEMS }),
  m.edgeUpdate(11000, "e1", "completed"),
  m.edgeUpdate(11200, "e2", "active"),

  // 3) Preview shows the finished list.
  m.nodeUpdate(11900, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(12500, "preview", "Preview", "value", ITEMS, "list"),
  m.nodeUpdate(13100, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: ITEMS }),
  m.edgeUpdate(13300, "e2", "completed"),
  m.jobUpdate(13600, "completed", { outputs: { value: ITEMS } }),
];

export const listGeneratorCast: DemoCast = {
  version: CAST_VERSION,
  id: "list-generator",
  name: "List Generator",
  description: "Turn one topic into a structured list with a single LLM node.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16000,
  fps: 30,
  workflow,
  metadata: {
    [INPUT_TYPE]: meta({
      node_type: INPUT_TYPE,
      title: "String Input",
      properties: [prop("name", "str"), prop("value", "str")],
      outputs: [out("output", "str")],
      inline_fields: ["value"],
      input_fields: [],
    }),
    [LIST_TYPE]: meta({
      node_type: LIST_TYPE,
      title: "List Generator",
      auto_save_asset: true,
      properties: [prop("model", "language_model"), prop("prompt", "str")],
      outputs: [out("item", "str", true), out("index", "int", true), out("output", "list")],
      inline_fields: [],
      input_fields: ["prompt"],
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
  // Frames the three-node row (graph bbox ~x[0,1140] y[150,490]) in 1920×1080.
  viewport: { x: 360, y: 280, zoom: 0.92 },
};
