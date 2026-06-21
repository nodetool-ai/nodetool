/**
 * A small, fully self-contained synthetic cast.
 *
 * It uses fabricated (but well-formed) node metadata and an inline SVG data URI
 * for the generated image, so it renders with no recording, no asset files, and
 * no backend. Handy for previewing the player, for tests, and as a worked
 * example of the cast shape. Real demos come from CastRecorder.
 */
import type {
  NodeMetadata,
  OutputSlot,
  Property,
  PropertyTypeMetadata,
  Workflow,
} from "../stores/ApiTypes";
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";

const t = (type: string): PropertyTypeMetadata => ({
  type,
  optional: false,
  type_args: [],
});

const prop = (name: string, type: string): Property => ({
  name,
  type: t(type),
  default: undefined,
  title: name,
  description: null,
  min: null,
  max: null,
  json_schema_extra: null,
  required: false,
});

const out = (name: string, type: string, stream = false): OutputSlot => ({
  name,
  type: t(type),
  stream,
});

const meta = (partial: Partial<NodeMetadata> & Pick<NodeMetadata, "node_type">): NodeMetadata => ({
  title: partial.node_type.split(".").pop() ?? partial.node_type,
  description: "",
  namespace: partial.node_type.split(".").slice(0, -1).join("."),
  layout: "default",
  properties: [],
  outputs: [],
  recommended_models: [],
  inline_fields: [],
  required_settings: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false,
  ...partial,
});

const GENERATE_TYPE = "demo.text.Generate";

const SVG_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1e3a8a"/>
          <stop offset="0.6" stop-color="#9333ea"/>
          <stop offset="1" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <rect width="360" height="220" fill="url(#g)"/>
      <circle cx="280" cy="60" r="28" fill="#fde68a" opacity="0.9"/>
      <path d="M0 170 L90 110 L150 150 L240 90 L360 160 L360 220 L0 220 Z" fill="#0f172a" opacity="0.55"/>
      <text x="20" y="200" fill="#e2e8f0" font-family="sans-serif" font-size="16">serene mountain lake</text>
    </svg>`
  );

const FULL_TEXT = "A serene mountain lake at golden hour, mirror-still.";
const TOKENS = ["A serene ", "mountain lake ", "at golden hour, ", "mirror-still."];

const workflow = {
  id: "wf-demo-sample",
  name: "Sample Demo",
  access: "private",
  description: "Synthetic cast for previewing the demo player.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      {
        id: "gen",
        type: GENERATE_TYPE,
        data: { prompt: "Describe a peaceful landscape" },
        ui_properties: {
          position: { x: 40, y: 80 },
          zIndex: 0,
          width: 280,
          selectable: true,
          title: "Generate",
        },
        dynamic_properties: {},
        dynamic_outputs: {},
      },
      {
        id: "preview",
        type: PREVIEW_NODE_TYPE,
        data: {},
        ui_properties: {
          position: { x: 440, y: 80 },
          zIndex: 0,
          width: 320,
          selectable: true,
          title: "Preview",
        },
        dynamic_properties: {},
        dynamic_outputs: {},
      },
    ],
    edges: [
      {
        id: "e1",
        source: "gen",
        sourceHandle: "text",
        target: "preview",
        targetHandle: "value",
      },
    ],
  },
} as unknown as Workflow;

const WF = "wf-demo-sample";
const JOB = "sample-job";

function chunkEvents(): CastEvent[] {
  const events: CastEvent[] = [];
  let time = 500;
  for (const token of TOKENS) {
    events.push({
      t: time,
      message: {
        type: "chunk",
        node_id: "gen",
        content_type: "text",
        content: token,
        workflow_id: WF,
        job_id: JOB,
      },
    });
    time += 350;
  }
  return events;
}

const events: CastEvent[] = [
  {
    t: 0,
    message: { type: "job_update", status: "running", job_id: JOB, workflow_id: WF },
  },
  {
    t: 200,
    message: {
      type: "node_update",
      status: "running",
      node_id: "gen",
      node_name: "Generate",
      node_type: GENERATE_TYPE,
      workflow_id: WF,
      job_id: JOB,
    },
  },
  ...chunkEvents(),
  {
    t: 1950,
    message: { type: "edge_update", edge_id: "e1", status: "active", workflow_id: WF, job_id: JOB },
  },
  {
    t: 2050,
    message: {
      type: "node_update",
      status: "completed",
      node_id: "gen",
      node_name: "Generate",
      node_type: GENERATE_TYPE,
      result: { text: FULL_TEXT },
      workflow_id: WF,
      job_id: JOB,
    },
  },
  {
    t: 2150,
    message: {
      type: "node_update",
      status: "running",
      node_id: "preview",
      node_name: "Preview",
      node_type: PREVIEW_NODE_TYPE,
      workflow_id: WF,
      job_id: JOB,
    },
  },
  {
    t: 2300,
    message: {
      type: "output_update",
      node_id: "preview",
      node_name: "Preview",
      output_name: "value",
      value: { type: "image", uri: SVG_IMAGE },
      output_type: "image",
      metadata: {},
      workflow_id: WF,
      job_id: JOB,
    },
  },
  {
    t: 2500,
    message: {
      type: "node_update",
      status: "completed",
      node_id: "preview",
      node_name: "Preview",
      node_type: PREVIEW_NODE_TYPE,
      result: { value: { type: "image", uri: SVG_IMAGE } },
      workflow_id: WF,
      job_id: JOB,
    },
  },
  {
    t: 2600,
    message: { type: "edge_update", edge_id: "e1", status: "completed", workflow_id: WF, job_id: JOB },
  },
  {
    t: 2700,
    message: {
      type: "job_update",
      status: "completed",
      job_id: JOB,
      workflow_id: WF,
      result: { outputs: { value: { type: "image", uri: SVG_IMAGE } } },
    },
  },
];

export const sampleCast: DemoCast = {
  version: CAST_VERSION,
  id: "sample-demo",
  name: "Sample Demo",
  description: "Synthetic two-node cast: streaming text → image preview.",
  createdAt: new Date(0).toISOString(),
  durationMs: 4200,
  fps: 30,
  workflow,
  metadata: {
    [GENERATE_TYPE]: meta({
      node_type: GENERATE_TYPE,
      title: "Generate",
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
  // Centers the two nodes (graph bbox ~x[40,760] y[80,350]) in a 1920×1080 frame.
  viewport: { x: 560, y: 300, zoom: 1.3 },
};
