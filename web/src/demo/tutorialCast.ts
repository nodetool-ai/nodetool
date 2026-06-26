/**
 * Tutorial cast — the "How to use NodeTool" intro.
 *
 * A self-contained, backend-free demo of a real four-node AI pipeline:
 *
 *   Text Input  →  Enhance Prompt (LLM, streaming)  →  Generate Image  →  Preview
 *
 * It is fully synthetic (fabricated-but-well-formed node metadata and an inline
 * SVG data URI for the generated image), so it renders with no recording, no
 * pinned asset files, and no backend — the same approach as `sampleCast`, just
 * a longer, narratable timeline. The Remotion `Tutorial` composition
 * (demo/src/Tutorial.tsx) replays it underneath chapter cards and captions that
 * teach the core flow: add nodes, connect them, run, watch outputs appear live.
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

const meta = (
  partial: Partial<NodeMetadata> & Pick<NodeMetadata, "node_type">
): NodeMetadata => ({
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

const INPUT_TYPE = "nodetool.input.TextInput";
const ENHANCE_TYPE = "nodetool.llm.Enhance";
const IMAGE_TYPE = "nodetool.image.Generate";

const PROMPT = "a serene mountain lake at golden hour";
const ENHANCED =
  "A serene alpine lake at golden hour: still mirror water reflecting amber peaks, soft volumetric light, wisps of mist, cinematic, ultra-detailed.";

// Stream the enhanced prompt in believable LLM-sized chunks.
const TOKENS = [
  "A serene alpine ",
  "lake at golden hour: ",
  "still mirror water ",
  "reflecting amber peaks, ",
  "soft volumetric light, ",
  "wisps of mist, ",
  "cinematic, ",
  "ultra-detailed.",
];

/** Inline generated image so replay needs no pinned asset files. */
const SVG_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f59e0b"/>
          <stop offset="0.5" stop-color="#fb923c"/>
          <stop offset="1" stop-color="#7c3aed"/>
        </linearGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7c3aed"/>
          <stop offset="1" stop-color="#1e1b4b"/>
        </linearGradient>
      </defs>
      <rect width="420" height="150" fill="url(#sky)"/>
      <rect y="150" width="420" height="130" fill="url(#water)"/>
      <circle cx="320" cy="70" r="34" fill="#fef3c7" opacity="0.95"/>
      <path d="M0 150 L70 70 L130 120 L210 50 L300 110 L360 80 L420 130 L420 150 Z" fill="#4c1d95"/>
      <path d="M0 150 L70 230 L130 180 L210 250 L300 190 L360 220 L420 170 L420 150 Z" fill="#312e81" opacity="0.85"/>
      <text x="20" y="262" fill="#e9d5ff" font-family="sans-serif" font-size="15">serene mountain lake</text>
    </svg>`
  );

const WF = "wf-tutorial";
const JOB = "tutorial-job";

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  title: string,
  data: Record<string, unknown> = {}
) => ({
  id,
  type,
  data,
  ui_properties: {
    position: { x, y },
    zIndex: 0,
    width,
    selectable: true,
    title,
  },
  dynamic_properties: {},
  dynamic_outputs: {},
});

const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
) => ({ id, source, sourceHandle, target, targetHandle });

const workflow = {
  id: WF,
  name: "Image Pipeline",
  access: "private",
  description: "Tutorial pipeline: prompt → enhance → generate image → preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("input", INPUT_TYPE, 0, 140, 250, "Text Input", {
        name: "prompt",
        text: PROMPT,
      }),
      node("enhance", ENHANCE_TYPE, 360, 140, 280, "Enhance Prompt", {
        prompt: "",
      }),
      node("generate", IMAGE_TYPE, 740, 140, 280, "Generate Image", {
        prompt: "",
      }),
      node("preview", PREVIEW_NODE_TYPE, 1120, 140, 320, "Preview", {}),
    ],
    edges: [
      edge("e1", "input", "text", "enhance", "prompt"),
      edge("e2", "enhance", "text", "generate", "prompt"),
      edge("e3", "generate", "image", "preview", "value"),
    ],
  },
} as unknown as Workflow;

const nodeUpdate = (
  t: number,
  node_id: string,
  node_name: string,
  node_type: string,
  status: "running" | "completed",
  result?: Record<string, unknown>
): CastEvent => ({
  t,
  message: {
    type: "node_update",
    status,
    node_id,
    node_name,
    node_type,
    ...(result ? { result } : {}),
    workflow_id: WF,
    job_id: JOB,
  },
});

function streamEvents(): CastEvent[] {
  const events: CastEvent[] = [];
  let time = 1300;
  for (const token of TOKENS) {
    events.push({
      t: time,
      message: {
        type: "chunk",
        node_id: "enhance",
        content_type: "text",
        content: token,
        workflow_id: WF,
        job_id: JOB,
      },
    });
    time += 480;
  }
  return events;
}

function progressEvents(): CastEvent[] {
  const events: CastEvent[] = [];
  const total = 30;
  const start = 6300;
  const span = 7400; // ~7.4s of visible image generation
  for (let step = 1; step <= total; step++) {
    events.push({
      t: Math.round(start + (span * step) / total),
      message: {
        type: "node_progress",
        node_id: "generate",
        progress: step,
        total,
        workflow_id: WF,
        job_id: JOB,
      },
    });
  }
  return events;
}

const events: CastEvent[] = [
  { t: 0, message: { type: "job_update", status: "running", job_id: JOB, workflow_id: WF } },

  // 1) Text Input hands its prompt downstream.
  nodeUpdate(150, "input", "Text Input", INPUT_TYPE, "running"),
  nodeUpdate(600, "input", "Text Input", INPUT_TYPE, "completed", { text: PROMPT }),
  { t: 700, message: { type: "edge_update", edge_id: "e1", status: "active", workflow_id: WF, job_id: JOB } },

  // 2) Enhance Prompt streams an expanded prompt token by token.
  nodeUpdate(900, "enhance", "Enhance Prompt", ENHANCE_TYPE, "running"),
  ...streamEvents(),
  nodeUpdate(5300, "enhance", "Enhance Prompt", ENHANCE_TYPE, "completed", { text: ENHANCED }),
  { t: 5450, message: { type: "edge_update", edge_id: "e1", status: "completed", workflow_id: WF, job_id: JOB } },
  { t: 5600, message: { type: "edge_update", edge_id: "e2", status: "active", workflow_id: WF, job_id: JOB } },

  // 3) Generate Image runs with a visible progress bar, then emits the image.
  nodeUpdate(6000, "generate", "Generate Image", IMAGE_TYPE, "running"),
  ...progressEvents(),
  nodeUpdate(14100, "generate", "Generate Image", IMAGE_TYPE, "completed", {
    image: { type: "image", uri: SVG_IMAGE },
  }),
  { t: 14250, message: { type: "edge_update", edge_id: "e2", status: "completed", workflow_id: WF, job_id: JOB } },
  { t: 14400, message: { type: "edge_update", edge_id: "e3", status: "active", workflow_id: WF, job_id: JOB } },

  // 4) Preview renders the final image right on the canvas.
  nodeUpdate(14700, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  {
    t: 15000,
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
  nodeUpdate(15400, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", {
    value: { type: "image", uri: SVG_IMAGE },
  }),
  { t: 15600, message: { type: "edge_update", edge_id: "e3", status: "completed", workflow_id: WF, job_id: JOB } },
  {
    t: 15900,
    message: {
      type: "job_update",
      status: "completed",
      job_id: JOB,
      workflow_id: WF,
      result: { outputs: { value: { type: "image", uri: SVG_IMAGE } } },
    },
  },
];

export const tutorialCast: DemoCast = {
  version: CAST_VERSION,
  id: "intro-tutorial",
  name: "Intro Tutorial",
  description:
    "How to use NodeTool: a four-node AI pipeline — text input → enhance → generate image → preview.",
  createdAt: new Date(0).toISOString(),
  durationMs: 19000,
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
    [ENHANCE_TYPE]: meta({
      node_type: ENHANCE_TYPE,
      title: "Enhance Prompt",
      properties: [prop("prompt", "str")],
      outputs: [out("text", "str", true)],
      inline_fields: ["prompt"],
      is_streaming_output: true,
    }),
    [IMAGE_TYPE]: meta({
      node_type: IMAGE_TYPE,
      title: "Generate Image",
      properties: [prop("prompt", "str")],
      outputs: [out("image", "image")],
      inline_fields: ["prompt"],
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
  // Frames the four-node row (graph bbox ~x[0,1440] y[140,420]) in 1920×1080.
  viewport: { x: 250, y: 260, zoom: 0.95 },
};
