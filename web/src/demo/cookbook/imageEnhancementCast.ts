/**
 * Cookbook Pattern 1 — Simple Pipeline (Image Enhancement).
 *
 *   Image Input → Unsharp Mask → Auto Contrast → Output
 *
 * A straight transform chain: a photo flows through two PIL image filters, each
 * rendering its result in an image content card, and lands in an Output sink.
 * Fully synthetic — the kitten image stands in for the enhanced photo at every
 * stage, so it replays with no backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { PHOTO_LANDSCAPE_IMAGE_DATA_URI } from "../assets/cookbookImages";
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
const UNSHARP = "lib.image.filter.UnsharpMask";
const AUTO_CONTRAST = "lib.image.enhance.AutoContrast";

const WF = "wf-cookbook-image-enhancement";
const JOB = "cookbook-image-enhancement-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: PHOTO_LANDSCAPE_IMAGE_DATA_URI };

const nodes = [
  node("photo", IMAGE_INPUT, 0, 170, 280, "Photo", { name: "photo", value: image }),
  node("sharpen", UNSHARP, 400, 170, 280, "Unsharp Mask", { radius: 2, percent: 150 }),
  node("contrast", AUTO_CONTRAST, 800, 170, 280, "Auto Contrast", { cutoff: 2 }),
  node("output", OUTPUT_NODE_TYPE, 1200, 170, 280, "Enhanced", { name: "enhanced" }),
];
const edges = [
  edge("e1", "photo", "output", "sharpen", "image"),
  edge("e2", "sharpen", "output", "contrast", "image"),
  edge("e3", "contrast", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "photo", "Photo", IMAGE_INPUT, "running"),
  m.nodeUpdate(1400, "photo", "Photo", IMAGE_INPUT, "completed", { output: image }),
  m.edgeUpdate(1700, "e1", "active"),

  m.nodeUpdate(2400, "sharpen", "Unsharp Mask", UNSHARP, "running"),
  ...m.progress("sharpen", 10, 2800, 1500),
  m.nodeUpdate(4500, "sharpen", "Unsharp Mask", UNSHARP, "completed", { output: image }),
  m.edgeUpdate(4700, "e1", "completed"),
  m.edgeUpdate(4900, "e2", "active"),

  m.nodeUpdate(5500, "contrast", "Auto Contrast", AUTO_CONTRAST, "running"),
  ...m.progress("contrast", 10, 5900, 1500),
  m.nodeUpdate(7600, "contrast", "Auto Contrast", AUTO_CONTRAST, "completed", { output: image }),
  m.edgeUpdate(7800, "e2", "completed"),
  m.edgeUpdate(8000, "e3", "active"),

  m.nodeUpdate(8600, "output", "Enhanced", OUTPUT_NODE_TYPE, "running"),
  m.output(9000, "output", "Enhanced", "value", image, "image"),
  m.nodeUpdate(9400, "output", "Enhanced", OUTPUT_NODE_TYPE, "completed", { value: image }),
  m.edgeUpdate(9600, "e3", "completed"),
  m.jobUpdate(9900, "completed", { outputs: { enhanced: image } }),
];

export const imageEnhancementCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-image-enhancement",
  name: "Image Enhancement",
  description: "A photo through two image filters — sharpen, then auto-contrast.",
  createdAt: new Date(0).toISOString(),
  durationMs: 12000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Image Enhancement",
    "Image → Unsharp Mask → Auto Contrast → Output.",
    nodes,
    edges
  ),
  metadata: {
    [IMAGE_INPUT]: imageInputMeta(),
    [UNSHARP]: imageNodeMeta(UNSHARP, "Unsharp Mask", [prop("image", "image")]),
    [AUTO_CONTRAST]: imageNodeMeta(AUTO_CONTRAST, "Auto Contrast", [prop("image", "image")]),
    [OUTPUT_NODE_TYPE]: outputMeta("Enhanced"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
