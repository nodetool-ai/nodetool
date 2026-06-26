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
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "./assets/exampleImage";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.TextInput";
const ENHANCE_TYPE = "nodetool.llm.Enhance";
const IMAGE_TYPE = "nodetool.image.TextToImage";

const WF = "wf-tutorial";
const JOB = "tutorial-job";
const m = castMessages(WF, JOB);

const PROMPT = "a cute kitten holding a hello world sign";

// Stream the enhanced prompt in believable LLM-sized chunks.
const TOKENS = [
  "A fluffy ginger kitten ",
  "on a sunny cobblestone street, ",
  "holding a cardboard sign ",
  'that reads "HELLO WORLD", ',
  "big round eyes, ",
  "soft bokeh, warm light, ",
  "cinematic, ",
  "ultra-detailed.",
];
const ENHANCED = TOKENS.join("");

/** The generated image (a "hello world" kitten), inlined as a data URI. */
const image = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };

const workflow = {
  id: WF,
  name: "Image Pipeline",
  access: "private",
  description: "Tutorial pipeline: prompt → enhance → generate image.",
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
      node("generate", IMAGE_TYPE, 740, 140, 300, "Text To Image", { prompt: "" }),
    ],
    edges: [
      edge("e1", "input", "text", "enhance", "prompt"),
      edge("e2", "enhance", "text", "generate", "prompt"),
    ],
  },
} as unknown as Workflow;

// Paced slowly on purpose: each node holds long enough for the camera to settle
// and the viewer to read its fields, the streamed prompt, and the progress bar.
// The Generate Image node displays the result itself — no separate preview.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) Text Input hands its prompt downstream.
  m.nodeUpdate(300, "input", "Text Input", INPUT_TYPE, "running"),
  m.nodeUpdate(1400, "input", "Text Input", INPUT_TYPE, "completed", { text: PROMPT }),
  m.edgeUpdate(1600, "e1", "active"),

  // 2) Enhance Prompt streams an expanded prompt token by token.
  m.nodeUpdate(2200, "enhance", "Enhance Prompt", ENHANCE_TYPE, "running"),
  ...m.stream("enhance", TOKENS, 2600, 6400),
  m.nodeUpdate(9600, "enhance", "Enhance Prompt", ENHANCE_TYPE, "completed", { text: ENHANCED }),
  m.edgeUpdate(9800, "e1", "completed"),
  m.edgeUpdate(10000, "e2", "active"),

  // 3) Generate Image runs a short progress, then shows the image in the node.
  m.nodeUpdate(10600, "generate", "Text To Image", IMAGE_TYPE, "running"),
  ...m.progress("generate", 12, 11000, 4000),
  m.nodeUpdate(15500, "generate", "Text To Image", IMAGE_TYPE, "completed", { image }),
  m.edgeUpdate(15700, "e2", "completed"),
  m.jobUpdate(16000, "completed", { outputs: { image } }),
];

export const tutorialCast: DemoCast = {
  version: CAST_VERSION,
  id: "intro-tutorial",
  name: "Intro Tutorial",
  description:
    "How to use NodeTool: a three-node AI pipeline — text input → enhance → generate image.",
  createdAt: new Date(0).toISOString(),
  durationMs: 18000,
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
      title: "Text To Image",
      properties: [prop("prompt", "str")],
      outputs: [out("image", "image")],
      inline_fields: ["prompt"],
    }),
  },
  events,
  assets: [],
  // Frames the three-node row (graph bbox ~x[0,1040] y[140,420]) in 1920×1080.
  viewport: { x: 420, y: 250, zoom: 1.05 },
};
