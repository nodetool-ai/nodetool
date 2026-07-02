/**
 * "Combine inputs" tutorial cast.
 *
 * Two String Inputs feed a single Prompt node (`nodetool.text.Prompt`), which
 * fills a template with both values — the first graph that branches *in*
 * (fan-in) rather than running a straight line. The Prompt node renders with its
 * bespoke body (`PromptComposerBody`): the `{{ name }}` / `{{ topic }}` template
 * with insertable variable chips, fed by two dynamic input handles. Fully
 * synthetic: real metadata, no AI, no backend.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.StringInput";
const PROMPT_TYPE = "nodetool.text.Prompt";

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
  description: "Two inputs → Prompt template → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("name", INPUT_TYPE, 0, 120, 240, "Name", { name: "name", value: NAME }),
      node("topic", INPUT_TYPE, 0, 360, 240, "Topic", { name: "topic", value: TOPIC }),
      // The Prompt node's {{name}}/{{topic}} variables are dynamic inputs — the
      // bespoke body renders a left handle per dynamic property.
      node("format", PROMPT_TYPE, 400, 220, 320, "Prompt", { prompt: TEMPLATE }, {
        name: "",
        topic: "",
      }),
      node("preview", PREVIEW_NODE_TYPE, 840, 220, 340, "Preview", {}),
    ],
    edges: [
      edge("e1", "name", "output", "format", "name"),
      edge("e2", "topic", "output", "format", "topic"),
      edge("e3", "format", "output", "preview", "value"),
    ],
  },
} as unknown as Workflow;

// Both inputs resolve, then the template node merges them into one string.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) Two inputs each hold a value.
  m.nodeUpdate(300, "name", "Name", INPUT_TYPE, "running"),
  m.nodeUpdate(600, "topic", "Topic", INPUT_TYPE, "running"),
  m.nodeUpdate(1500, "name", "Name", INPUT_TYPE, "completed", { output: NAME }),
  m.nodeUpdate(1800, "topic", "Topic", INPUT_TYPE, "completed", { output: TOPIC }),
  m.edgeUpdate(2100, "e1", "active"),
  m.edgeUpdate(2300, "e2", "active"),

  // 2) Prompt fills the template from both inputs.
  m.nodeUpdate(3000, "format", "Prompt", PROMPT_TYPE, "running"),
  m.nodeUpdate(4800, "format", "Prompt", PROMPT_TYPE, "completed", { output: RESULT }),
  m.edgeUpdate(5000, "e1", "completed"),
  m.edgeUpdate(5200, "e2", "completed"),
  m.edgeUpdate(5400, "e3", "active"),

  // 3) Preview shows the merged result.
  m.nodeUpdate(6100, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(6700, "preview", "Preview", "value", RESULT, "str"),
  m.nodeUpdate(7300, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: RESULT }),
  m.edgeUpdate(7600, "e3", "completed"),
  m.jobUpdate(7900, "completed", { outputs: { value: RESULT } }),
];

export const templateMergeCast: DemoCast = {
  version: CAST_VERSION,
  id: "combine-inputs",
  name: "Combine Inputs",
  description: "Merge two inputs into one result with a Prompt template.",
  createdAt: new Date(0).toISOString(),
  durationMs: 10000,
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
    [PROMPT_TYPE]: meta({
      node_type: PROMPT_TYPE,
      title: "Prompt",
      properties: [prop("prompt", "str")],
      outputs: [out("output", "str")],
      inline_fields: [],
      input_fields: ["prompt"],
      supports_dynamic_inputs: true,
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
