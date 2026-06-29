/**
 * "Combine inputs" tutorial cast.
 *
 * Two text inputs feed a single Format Text node, which fills a template with
 * both values — the first graph that branches *in* (fan-in) rather than running
 * a straight line. Fully synthetic: fabricated metadata, no AI, no backend.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.TextInput";
const FORMAT_TYPE = "nodetool.text.FormatText";

const WF = "wf-combine-inputs";
const JOB = "combine-inputs-job";
const m = castMessages(WF, JOB);

const NAME = "Ada";
const TOPIC = "robotics";
const TEMPLATE = "Hi, I'm {{ name }} and I work in {{ topic }}.";
const RESULT = `Hi, I'm ${NAME} and I work in ${TOPIC}.`;

const workflow = {
  id: WF,
  name: "Combine Inputs",
  access: "private",
  description: "Two inputs → Format Text → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("name", INPUT_TYPE, 0, 120, 240, "Name", { name: "name", text: NAME }),
      node("topic", INPUT_TYPE, 0, 360, 240, "Topic", { name: "topic", text: TOPIC }),
      node("format", FORMAT_TYPE, 400, 220, 320, "Format Text", { template: TEMPLATE }),
      node("preview", PREVIEW_NODE_TYPE, 840, 220, 340, "Preview", {}),
    ],
    edges: [
      edge("e1", "name", "text", "format", "name"),
      edge("e2", "topic", "text", "format", "topic"),
      edge("e3", "format", "text", "preview", "value"),
    ],
  },
} as unknown as Workflow;

// Both inputs resolve, then the template node merges them into one string.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) Two inputs each hold a value.
  m.nodeUpdate(300, "name", "Name", INPUT_TYPE, "running"),
  m.nodeUpdate(600, "topic", "Topic", INPUT_TYPE, "running"),
  m.nodeUpdate(1500, "name", "Name", INPUT_TYPE, "completed", { text: NAME }),
  m.nodeUpdate(1800, "topic", "Topic", INPUT_TYPE, "completed", { text: TOPIC }),
  m.edgeUpdate(2100, "e1", "active"),
  m.edgeUpdate(2300, "e2", "active"),

  // 2) Format Text fills the template from both inputs.
  m.nodeUpdate(3000, "format", "Format Text", FORMAT_TYPE, "running"),
  m.nodeUpdate(4800, "format", "Format Text", FORMAT_TYPE, "completed", { text: RESULT }),
  m.edgeUpdate(5000, "e1", "completed"),
  m.edgeUpdate(5200, "e2", "completed"),
  m.edgeUpdate(5400, "e3", "active"),

  // 3) Preview shows the merged result.
  m.nodeUpdate(6100, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(6700, "preview", "Preview", "value", RESULT, "string"),
  m.nodeUpdate(7300, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: RESULT }),
  m.edgeUpdate(7600, "e3", "completed"),
  m.jobUpdate(7900, "completed", { outputs: { value: RESULT } }),
];

export const templateMergeCast: DemoCast = {
  version: CAST_VERSION,
  id: "combine-inputs",
  name: "Combine Inputs",
  description: "Merge two inputs into one result with a Format Text template.",
  createdAt: new Date(0).toISOString(),
  durationMs: 10000,
  fps: 30,
  workflow,
  metadata: {
    [INPUT_TYPE]: meta({
      node_type: INPUT_TYPE,
      title: "Text Input",
      properties: [prop("text", "str")],
      outputs: [out("text", "str")],
      inline_fields: ["text"],
    }),
    [FORMAT_TYPE]: meta({
      node_type: FORMAT_TYPE,
      title: "Format Text",
      properties: [prop("template", "str"), prop("name", "str"), prop("topic", "str")],
      outputs: [out("text", "str")],
      inline_fields: ["template"],
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
  // Frames the fan-in graph (bbox ~x[0,1180] y[120,560]) in 1920×1080.
  viewport: { x: 360, y: 210, zoom: 0.82 },
};
