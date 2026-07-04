/**
 * Cookbook Pattern 14 — Image Enhancement & Upscaling.
 *
 *   Low-Res Image → Topaz Upscale → High-Res Output
 *
 * A single AI upscaling node lifts a low-resolution image to a crisp,
 * higher-resolution result shown in its image content card. Fully synthetic —
 * the kitten image stands in for both ends, so it replays with no backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { UPSCALE_BEFORE_IMAGE_DATA_URI } from "../assets/cookbookImages";
import {
  OUTPUT_NODE_TYPE,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageInputMeta,
  imageNodeMeta,
  node,
  outputMeta,
} from "./builders";

const IMAGE_INPUT = "nodetool.input.ImageInput";
const TOPAZ = "fal.image_to_image.TopazUpscaleImage";

const WF = "wf-cookbook-image-upscaling";
const JOB = "cookbook-image-upscaling-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: UPSCALE_BEFORE_IMAGE_DATA_URI };

const nodes = [
  node("lowres", IMAGE_INPUT, 0, 170, 300, "Low Res", { name: "lowres", value: image }),
  node("upscale", TOPAZ, 460, 170, 320, "Topaz Upscale", { denoise: true }),
  node("output", OUTPUT_NODE_TYPE, 900, 170, 280, "High Res", { name: "highres" }),
];
const edges = [
  edge("e1", "lowres", "output", "upscale", "image"),
  edge("e2", "upscale", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "lowres", "Low Res", IMAGE_INPUT, "running"),
  m.nodeUpdate(1500, "lowres", "Low Res", IMAGE_INPUT, "completed", { output: image }),
  m.edgeUpdate(1800, "e1", "active"),

  m.nodeUpdate(2400, "upscale", "Topaz Upscale", TOPAZ, "running"),
  ...m.progress("upscale", 14, 2900, 4800),
  m.nodeUpdate(8000, "upscale", "Topaz Upscale", TOPAZ, "completed", { output: image }),
  m.edgeUpdate(8200, "e1", "completed"),
  m.edgeUpdate(8400, "e2", "active"),

  m.nodeUpdate(9000, "output", "High Res", OUTPUT_NODE_TYPE, "running"),
  m.output(9400, "output", "High Res", "value", image, "image"),
  m.nodeUpdate(9800, "output", "High Res", OUTPUT_NODE_TYPE, "completed", { value: image }),
  m.edgeUpdate(10000, "e2", "completed"),
  m.jobUpdate(10300, "completed", { outputs: { highres: image } }),
];

export const imageUpscalingCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-image-upscaling",
  name: "Image Upscaling",
  description: "Lift a low-resolution image to a crisp, higher-resolution result.",
  createdAt: new Date(0).toISOString(),
  durationMs: 12000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Image Upscaling",
    "Low-Res Image → Topaz Upscale → High-Res Output.",
    nodes,
    edges
  ),
  metadata: {
    [IMAGE_INPUT]: imageInputMeta(),
    [TOPAZ]: imageNodeMeta(TOPAZ, "Topaz Upscale", [prop("image", "image")]),
    [OUTPUT_NODE_TYPE]: outputMeta("High Res"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
