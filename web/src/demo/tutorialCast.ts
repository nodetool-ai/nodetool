/**
 * "First workflow" tutorial cast — the flagship intro.
 *
 * A self-contained, backend-free demo of a real four-node AI pipeline:
 *
 *   Text Input  →  Enhance Prompt (LLM, streaming)  →  Generate Image  →  Preview
 *
 * Fully synthetic (fabricated-but-well-formed node metadata and an inline SVG
 * data URI for the generated image), so it renders with no recording, no pinned
 * assets, and no backend. The Remotion `Tutorial` composition replays it under
 * chapter cards and captions that teach the core flow: add nodes, connect them,
 * run, watch outputs appear live.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.TextInput";
const ENHANCE_TYPE = "nodetool.llm.Enhance";
const IMAGE_TYPE = "nodetool.image.Generate";

const WF = "wf-tutorial";
const JOB = "tutorial-job";
const m = castMessages(WF, JOB);

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

const image = { type: "image", uri: SVG_IMAGE };

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
      node("input", INPUT_TYPE, 0, 140, 250, "Text Input", { name: "prompt", text: PROMPT }),
      node("enhance", ENHANCE_TYPE, 360, 140, 280, "Enhance Prompt", { prompt: "" }),
      node("generate", IMAGE_TYPE, 740, 140, 280, "Generate Image", { prompt: "" }),
      node("preview", PREVIEW_NODE_TYPE, 1120, 140, 320, "Preview", {}),
    ],
    edges: [
      edge("e1", "input", "text", "enhance", "prompt"),
      edge("e2", "enhance", "text", "generate", "prompt"),
      edge("e3", "generate", "image", "preview", "value"),
    ],
  },
} as unknown as Workflow;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) Text Input hands its prompt downstream.
  m.nodeUpdate(150, "input", "Text Input", INPUT_TYPE, "running"),
  m.nodeUpdate(600, "input", "Text Input", INPUT_TYPE, "completed", { text: PROMPT }),
  m.edgeUpdate(700, "e1", "active"),

  // 2) Enhance Prompt streams an expanded prompt token by token.
  m.nodeUpdate(900, "enhance", "Enhance Prompt", ENHANCE_TYPE, "running"),
  ...m.stream("enhance", TOKENS, 1300, 3840),
  m.nodeUpdate(5300, "enhance", "Enhance Prompt", ENHANCE_TYPE, "completed", { text: ENHANCED }),
  m.edgeUpdate(5450, "e1", "completed"),
  m.edgeUpdate(5600, "e2", "active"),

  // 3) Generate Image runs with a visible progress bar, then emits the image.
  m.nodeUpdate(6000, "generate", "Generate Image", IMAGE_TYPE, "running"),
  ...m.progress("generate", 30, 6300, 7400),
  m.nodeUpdate(14100, "generate", "Generate Image", IMAGE_TYPE, "completed", { image }),
  m.edgeUpdate(14250, "e2", "completed"),
  m.edgeUpdate(14400, "e3", "active"),

  // 4) Preview renders the final image right on the canvas.
  m.nodeUpdate(14700, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(15000, "preview", "Preview", "value", image, "image"),
  m.nodeUpdate(15400, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: image }),
  m.edgeUpdate(15600, "e3", "completed"),
  m.jobUpdate(15900, "completed", { outputs: { value: image } }),
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
