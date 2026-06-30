/**
 * Cookbook Pattern 15 — Storyboard to Video.
 *
 *   Story ┐
 *   Scene 1 ┤
 *   Scene 2 ┼→ Sora 2 Pro → Output
 *   Scene 3 ┘
 *
 * A story prompt plus up to three keyframes drive a keyframe-based video model
 * that fills the transitions between scenes. Fully synthetic — the kitten image
 * for each scene and a tiny inline WebM stand in for the run.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "../assets/exampleImage";
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

const STRING_INPUT = "nodetool.input.StringInput";
const IMAGE_INPUT = "nodetool.input.ImageInput";
const SORA = "fal.image_to_video.Sora2ImageToVideoPro";

const WF = "wf-cookbook-storyboard-to-video";
const JOB = "cookbook-storyboard-to-video-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };
const STORY = "A kitten wakes, ventures into a sunny street, and proudly raises a sign.";
const video = { type: "video", uri: SAMPLE_VIDEO_WEBM_DATA_URI, metadata: { format: "webm" } };

const nodes = [
  node("story", STRING_INPUT, 0, 40, 300, "Story", { name: "story", value: STORY }),
  node("scene1", IMAGE_INPUT, 0, 250, 260, "Scene 1", { name: "scene1", value: image }),
  node("scene2", IMAGE_INPUT, 0, 470, 260, "Scene 2", { name: "scene2", value: image }),
  node("scene3", IMAGE_INPUT, 0, 690, 260, "Scene 3", { name: "scene3", value: image }),
  node("sora", SORA, 420, 320, 320, "Sora 2 Pro", { prompt: STORY }),
  node("output", OUTPUT_NODE_TYPE, 860, 320, 280, "Output", { name: "video" }),
];
const edges = [
  edge("e1", "story", "output", "sora", "prompt"),
  edge("e2", "scene1", "output", "sora", "image1"),
  edge("e3", "scene2", "output", "sora", "image2"),
  edge("e4", "scene3", "output", "sora", "image3"),
  edge("e5", "sora", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "story", "Story", STRING_INPUT, "running"),
  m.nodeUpdate(400, "scene1", "Scene 1", IMAGE_INPUT, "running"),
  m.nodeUpdate(500, "scene2", "Scene 2", IMAGE_INPUT, "running"),
  m.nodeUpdate(600, "scene3", "Scene 3", IMAGE_INPUT, "running"),
  m.nodeUpdate(1400, "story", "Story", STRING_INPUT, "completed", { output: STORY }),
  m.nodeUpdate(1500, "scene1", "Scene 1", IMAGE_INPUT, "completed", { output: image }),
  m.nodeUpdate(1600, "scene2", "Scene 2", IMAGE_INPUT, "completed", { output: image }),
  m.nodeUpdate(1700, "scene3", "Scene 3", IMAGE_INPUT, "completed", { output: image }),
  m.edgeUpdate(1900, "e1", "active"),
  m.edgeUpdate(2000, "e2", "active"),
  m.edgeUpdate(2100, "e3", "active"),
  m.edgeUpdate(2200, "e4", "active"),

  m.nodeUpdate(2800, "sora", "Sora 2 Pro", SORA, "running"),
  ...m.progress("sora", 18, 3300, 7000),
  m.nodeUpdate(10800, "sora", "Sora 2 Pro", SORA, "completed", { output: video }),
  m.edgeUpdate(11000, "e1", "completed"),
  m.edgeUpdate(11100, "e2", "completed"),
  m.edgeUpdate(11200, "e3", "completed"),
  m.edgeUpdate(11300, "e4", "completed"),
  m.edgeUpdate(11500, "e5", "active"),

  m.nodeUpdate(12100, "output", "Output", OUTPUT_NODE_TYPE, "running"),
  m.output(12500, "output", "Output", "value", video, "video"),
  m.nodeUpdate(12900, "output", "Output", OUTPUT_NODE_TYPE, "completed", { value: video }),
  m.edgeUpdate(13100, "e5", "completed"),
  m.jobUpdate(13400, "completed", { outputs: { video } }),
];

export const storyboardToVideoCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-storyboard-to-video",
  name: "Storyboard to Video",
  description: "Drive a keyframe video model with a story prompt and three scene images.",
  createdAt: new Date(0).toISOString(),
  durationMs: 15500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Storyboard to Video",
    "Story + 3 Scenes → Sora 2 Pro → Output.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [IMAGE_INPUT]: imageInputMeta(),
    [SORA]: videoNodeMeta(SORA, "Sora 2 Pro", [
      prop("prompt", "str"),
      prop("image1", "image"),
      prop("image2", "image"),
      prop("image3", "image"),
    ]),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
