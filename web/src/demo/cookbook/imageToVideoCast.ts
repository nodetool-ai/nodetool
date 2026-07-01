/**
 * Cookbook Pattern 12 — Image-to-Video Generation.
 *
 *   Image ┐
 *         ┼→ Image To Video (Kling 1.6 Standard) → Output
 *   Motion ┘
 *
 * Animate a still image with a motion guide; the clip renders in the node's
 * video content card. Fully synthetic — the kitten image plus a tiny inline WebM
 * stand in for the run.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { VIDEO_STILL_IMAGE_DATA_URI } from "../assets/cookbookImages";
import { SAMPLE_VIDEO_WEBM_DATA_URI } from "../assets/sampleMedia";
import {
  OUTPUT_NODE_TYPE,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageInputMeta,
  node,
  outputMeta,
  stringInputMeta,
  videoNodeMeta,
} from "./builders";

const IMAGE_INPUT = "nodetool.input.ImageInput";
const STRING_INPUT = "nodetool.input.StringInput";
const KLING = "fal.image_to_video.KlingVideoV16StandardImageToVideo";

const WF = "wf-cookbook-image-to-video";
const JOB = "cookbook-image-to-video-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: VIDEO_STILL_IMAGE_DATA_URI };
const MOTION = "slow zoom in, gentle camera pan, the kitten blinks";
const video = { type: "video", uri: SAMPLE_VIDEO_WEBM_DATA_URI, metadata: { format: "webm" } };

const nodes = [
  node("image", IMAGE_INPUT, 0, 40, 300, "Image", { name: "image", value: image }),
  node("motion", STRING_INPUT, 0, 320, 300, "Motion Guide", { name: "motion", value: MOTION }),
  node("kling", KLING, 460, 170, 320, "Image To Video", { prompt: MOTION }),
  node("output", OUTPUT_NODE_TYPE, 900, 170, 280, "Output", { name: "video" }),
];
const edges = [
  edge("e1", "image", "output", "kling", "image"),
  edge("e2", "motion", "output", "kling", "prompt"),
  edge("e3", "kling", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "image", "Image", IMAGE_INPUT, "running"),
  m.nodeUpdate(400, "motion", "Motion Guide", STRING_INPUT, "running"),
  m.nodeUpdate(1400, "image", "Image", IMAGE_INPUT, "completed", { output: image }),
  m.nodeUpdate(1500, "motion", "Motion Guide", STRING_INPUT, "completed", { output: MOTION }),
  m.edgeUpdate(1700, "e1", "active"),
  m.edgeUpdate(1800, "e2", "active"),

  m.nodeUpdate(2400, "kling", "Image To Video", KLING, "running"),
  ...m.progress("kling", 16, 2900, 6000),
  m.nodeUpdate(9300, "kling", "Image To Video", KLING, "completed", { output: video }),
  m.edgeUpdate(9500, "e1", "completed"),
  m.edgeUpdate(9600, "e2", "completed"),
  m.edgeUpdate(9800, "e3", "active"),

  m.nodeUpdate(10400, "output", "Output", OUTPUT_NODE_TYPE, "running"),
  m.output(10800, "output", "Output", "value", video, "video"),
  m.nodeUpdate(11200, "output", "Output", OUTPUT_NODE_TYPE, "completed", { value: video }),
  m.edgeUpdate(11400, "e3", "completed"),
  m.jobUpdate(11700, "completed", { outputs: { video } }),
];

export const imageToVideoCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-image-to-video",
  name: "Image to Video",
  description: "Animate a still image with a motion guide using an image-to-video model.",
  createdAt: new Date(0).toISOString(),
  durationMs: 13500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Image to Video",
    "Image + Motion → Kling Image To Video → Output.",
    nodes,
    edges
  ),
  metadata: {
    [IMAGE_INPUT]: imageInputMeta(),
    [STRING_INPUT]: stringInputMeta(),
    [KLING]: videoNodeMeta(KLING, "Image To Video", [prop("image", "image"), prop("prompt", "str")]),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
