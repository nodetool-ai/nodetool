/**
 * "Describe an image" tutorial cast — the first multimodal walkthrough.
 *
 * An image flows into the real `nodetool.agents.Agent`, which looks at it and
 * streams a written description — the vision pattern behind the Image To Audio
 * Story and image-captioning templates:
 *
 *   Image Input  →  Agent (vision, streaming text card)  →  Preview
 *
 * - `nodetool.input.ImageInput` — generic input body; the picture renders inline
 *   from a data URI (ImageProperty → PropertyDropzone), so no backend or asset
 *   resolution is needed.
 * - `nodetool.agents.Agent` — `body: "content_card"`, text variant; the
 *   description streams in (ChunkDisplay) then settles, with the image wired into
 *   the Agent's `image` input.
 *
 * Fully synthetic (real metadata, an inline image data URI, streamed text, no
 * backend), so it replays with no recording and no pinned assets.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "./assets/exampleImage";
import type { Workflow } from "../stores/ApiTypes";

const IMAGE_INPUT_TYPE = "nodetool.input.ImageInput";
const AGENT_TYPE = "nodetool.agents.Agent";

const WF = "wf-describe-image";
const JOB = "describe-image-job";
const m = castMessages(WF, JOB);

/** The picture handed to the model (reuses the first-workflow kitten image). */
const image = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };
const INSTRUCTION = "Describe this image in one sentence.";

// Stream the description in believable LLM-sized chunks — and make it match the
// picture so the demo reads as a real vision run.
const DESC_TOKENS = [
  "A fluffy ginger kitten ",
  "sits on a sunny ",
  "cobblestone street, ",
  "holding up a small ",
  "cardboard sign ",
  'that reads "HELLO WORLD".',
];
const DESCRIPTION = DESC_TOKENS.join("");

const workflow = {
  id: WF,
  name: "Describe an Image",
  access: "private",
  description: "Image → Agent (vision) → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("image", IMAGE_INPUT_TYPE, 0, 150, 300, "Image", { name: "image", value: image }),
      node("describe", AGENT_TYPE, 460, 150, 320, "Describe", { prompt: INSTRUCTION }),
      node("preview", PREVIEW_NODE_TYPE, 900, 150, 340, "Preview", {}),
    ],
    edges: [
      edge("e1", "image", "output", "describe", "image"),
      edge("e2", "describe", "text", "preview", "value"),
    ],
  },
} as unknown as Workflow;

// Paced so the image registers, then the description streams phrase by phrase.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) An Image Input hands its picture downstream.
  m.nodeUpdate(300, "image", "Image", IMAGE_INPUT_TYPE, "running"),
  m.nodeUpdate(1500, "image", "Image", IMAGE_INPUT_TYPE, "completed", { output: image }),
  m.edgeUpdate(1800, "e1", "active"),

  // 2) The Agent looks at the image and streams a description into its text card.
  m.nodeUpdate(2600, "describe", "Describe", AGENT_TYPE, "running"),
  ...m.stream("describe", DESC_TOKENS, 3200, 6400),
  m.nodeUpdate(10000, "describe", "Describe", AGENT_TYPE, "completed", { text: DESCRIPTION }),
  m.edgeUpdate(10200, "e1", "completed"),
  m.edgeUpdate(10400, "e2", "active"),

  // 3) Preview shows the finished description.
  m.nodeUpdate(11100, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(11700, "preview", "Preview", "value", DESCRIPTION, "str"),
  m.nodeUpdate(12300, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: DESCRIPTION }),
  m.edgeUpdate(12600, "e2", "completed"),
  m.jobUpdate(12900, "completed", { outputs: { value: DESCRIPTION } }),
];

export const describeImageCast: DemoCast = {
  version: CAST_VERSION,
  id: "describe-image",
  name: "Describe an Image",
  description: "Feed a picture to a vision model and get a streamed description.",
  createdAt: new Date(0).toISOString(),
  durationMs: 15000,
  fps: 30,
  workflow,
  metadata: {
    [IMAGE_INPUT_TYPE]: meta({
      node_type: IMAGE_INPUT_TYPE,
      title: "Image Input",
      properties: [prop("name", "str"), prop("value", "image"), prop("description", "str")],
      outputs: [out("output", "image")],
      inline_fields: ["value"],
      input_fields: [],
    }),
    [AGENT_TYPE]: meta({
      node_type: AGENT_TYPE,
      title: "Agent",
      body: "content_card",
      auto_save_asset: true,
      properties: [
        prop("prompt", "str"),
        prop("model", "language_model"),
        prop("image", "image"),
      ],
      outputs: [out("text", "str"), out("chunk", "chunk", true)],
      inline_fields: [],
      input_fields: ["prompt", "image"],
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
  // Frames the three-node row (graph bbox ~x[0,1240] y[150,~520]) in 1920×1080.
  viewport: { x: 320, y: 270, zoom: 0.86 },
};
