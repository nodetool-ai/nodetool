/**
 * "Connect & run basics" tutorial cast.
 *
 * The simplest possible graph — a String Input, a one-step transform, and a
 * Preview — so a first-time user sees the whole loop: add nodes, wire a handle
 * into the next node's input, hit Run, read the output. Built from REAL node
 * types (`nodetool.input.StringInput` → `nodetool.text.ToUppercase` →
 * Preview), so the canvas renders the genuine node bodies. No AI, no assets,
 * instant.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const TEXT_TYPE = "nodetool.input.StringInput";
const UPPER_TYPE = "nodetool.text.ToUppercase";

const WF = "wf-connect-run";
const JOB = "connect-run-job";
const m = castMessages(WF, JOB);

const INPUT = "hello nodetool";
const OUTPUT = "HELLO NODETOOL";

const workflow = {
  id: WF,
  name: "Connect & Run",
  access: "private",
  description: "Text → Uppercase → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("text", TEXT_TYPE, 0, 160, 260, "Text", { name: "text", value: INPUT }),
      node("upper", UPPER_TYPE, 380, 160, 260, "Uppercase", { text: "" }),
      node("preview", PREVIEW_NODE_TYPE, 760, 160, 300, "Preview", {}),
    ],
    edges: [
      edge("e1", "text", "output", "upper", "text"),
      edge("e2", "upper", "output", "preview", "value"),
    ],
  },
} as unknown as Workflow;

// Slow, deliberate pacing so a first-timer can follow each beat.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) A String Input holds a value.
  m.nodeUpdate(300, "text", "Text", TEXT_TYPE, "running"),
  m.nodeUpdate(1300, "text", "Text", TEXT_TYPE, "completed", { output: INPUT }),
  m.edgeUpdate(1700, "e1", "active"),

  // 2) The transform runs and produces a result.
  m.nodeUpdate(2600, "upper", "Uppercase", UPPER_TYPE, "running"),
  m.nodeUpdate(4200, "upper", "Uppercase", UPPER_TYPE, "completed", { output: OUTPUT }),
  m.edgeUpdate(4400, "e1", "completed"),
  m.edgeUpdate(4700, "e2", "active"),

  // 3) Preview shows the output.
  m.nodeUpdate(5400, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(6000, "preview", "Preview", "value", OUTPUT, "str"),
  m.nodeUpdate(6600, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: OUTPUT }),
  m.edgeUpdate(6900, "e2", "completed"),
  m.jobUpdate(7200, "completed", { outputs: { value: OUTPUT } }),
];

export const connectRunCast: DemoCast = {
  version: CAST_VERSION,
  id: "connect-run",
  name: "Connect & Run",
  description: "The basics: add nodes, connect a handle, hit Run, read the output.",
  createdAt: new Date(0).toISOString(),
  durationMs: 10000,
  fps: 30,
  workflow,
  metadata: {
    [TEXT_TYPE]: meta({
      node_type: TEXT_TYPE,
      title: "String Input",
      properties: [prop("name", "str"), prop("value", "str")],
      outputs: [out("output", "str")],
      inline_fields: ["value"],
      input_fields: [],
    }),
    [UPPER_TYPE]: meta({
      node_type: UPPER_TYPE,
      title: "To Uppercase",
      properties: [prop("text", "str")],
      outputs: [out("output", "str")],
      inline_fields: ["text"],
      input_fields: [],
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
  // Frames the three-node row (graph bbox ~x[0,1060] y[160,400]) in 1920×1080.
  viewport: { x: 430, y: 300, zoom: 1.0 },
};
