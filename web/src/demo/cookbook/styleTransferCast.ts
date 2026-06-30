/**
 * Cookbook Pattern 9 — Advanced Image Processing (Style Transfer).
 *
 *   Content Image → Fit → Image To Text ─┐
 *   Style Image ───────────────────────→ Style Transfer (Img2Img) → Output
 *
 * Describe the content image, then re-render it in the style image's look with
 * an image-to-image model. Fully synthetic — the kitten image stands in at every
 * stage, so it replays with no model.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "../assets/exampleImage";
import {
  OUTPUT_NODE_TYPE,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageInputMeta,
  imageNodeMeta,
  node,
  outputMeta,
  simpleMeta,
} from "./builders";

const IMAGE_INPUT = "nodetool.input.ImageInput";
const FIT = "nodetool.image.Fit";
const IMAGE_TO_TEXT = "transformers.ImageToText";
const SD_IMG2IMG = "fal.image_to_image.StableDiffusionV3MediumImageToImage";

const WF = "wf-cookbook-style-transfer";
const JOB = "cookbook-style-transfer-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };
const CAPTION = "a ginger kitten holding a hello world sign on a sunny street";

const nodes = [
  node("content", IMAGE_INPUT, 0, 40, 280, "Content Image", { name: "content", value: image }),
  node("style", IMAGE_INPUT, 0, 320, 280, "Style Image", { name: "style", value: image }),
  node("fit", FIT, 400, 40, 260, "Fit", {}),
  node("describe", IMAGE_TO_TEXT, 760, 40, 300, "Image To Text", {}),
  node("transfer", SD_IMG2IMG, 1160, 40, 300, "Style Transfer", { prompt: "" }),
  node("output", OUTPUT_NODE_TYPE, 1560, 40, 280, "Output", { name: "styled" }),
];
const edges = [
  edge("e1", "content", "output", "fit", "image"),
  edge("e2", "fit", "output", "describe", "image"),
  edge("e3", "describe", "output", "transfer", "prompt"),
  edge("e4", "style", "output", "transfer", "image"),
  edge("e5", "transfer", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "content", "Content Image", IMAGE_INPUT, "running"),
  m.nodeUpdate(400, "style", "Style Image", IMAGE_INPUT, "running"),
  m.nodeUpdate(1400, "content", "Content Image", IMAGE_INPUT, "completed", { output: image }),
  m.nodeUpdate(1500, "style", "Style Image", IMAGE_INPUT, "completed", { output: image }),
  m.edgeUpdate(1700, "e1", "active"),

  m.nodeUpdate(2300, "fit", "Fit", FIT, "running"),
  ...m.progress("fit", 8, 2600, 1300),
  m.nodeUpdate(4100, "fit", "Fit", FIT, "completed", { output: image }),
  m.edgeUpdate(4300, "e1", "completed"),
  m.edgeUpdate(4500, "e2", "active"),

  m.nodeUpdate(5100, "describe", "Image To Text", IMAGE_TO_TEXT, "running"),
  m.nodeUpdate(6800, "describe", "Image To Text", IMAGE_TO_TEXT, "completed", { output: CAPTION }),
  m.edgeUpdate(7000, "e2", "completed"),
  m.edgeUpdate(7200, "e3", "active"),
  m.edgeUpdate(7300, "e4", "active"),

  m.nodeUpdate(7900, "transfer", "Style Transfer", SD_IMG2IMG, "running"),
  ...m.progress("transfer", 12, 8300, 3800),
  m.nodeUpdate(12400, "transfer", "Style Transfer", SD_IMG2IMG, "completed", { output: image }),
  m.edgeUpdate(12600, "e3", "completed"),
  m.edgeUpdate(12700, "e4", "completed"),
  m.edgeUpdate(12900, "e5", "active"),

  m.nodeUpdate(13500, "output", "Output", OUTPUT_NODE_TYPE, "running"),
  m.output(13900, "output", "Output", "value", image, "image"),
  m.nodeUpdate(14300, "output", "Output", OUTPUT_NODE_TYPE, "completed", { value: image }),
  m.edgeUpdate(14500, "e5", "completed"),
  m.jobUpdate(14800, "completed", { outputs: { styled: image } }),
];

export const styleTransferCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-style-transfer",
  name: "Style Transfer",
  description: "Caption a content image, then re-render it in a reference style.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Style Transfer",
    "Content + Style → Fit → Image To Text → Img2Img → Output.",
    nodes,
    edges
  ),
  metadata: {
    [IMAGE_INPUT]: imageInputMeta(),
    [FIT]: imageNodeMeta(FIT, "Fit", [prop("image", "image")]),
    [IMAGE_TO_TEXT]: simpleMeta(IMAGE_TO_TEXT, "Image To Text", "str", {
      inputs: ["image"],
      properties: [prop("image", "image")],
    }),
    [SD_IMG2IMG]: imageNodeMeta(SD_IMG2IMG, "Style Transfer", [
      prop("prompt", "str"),
      prop("image", "image"),
    ]),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
