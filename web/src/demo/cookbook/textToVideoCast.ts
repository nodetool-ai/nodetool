/**
 * Cookbook Pattern 11 — Text-to-Video Generation.
 *
 *   Prompt → Text To Video (Kling 1.6 Pro) → Output
 *
 * A single prompt drives a text-to-video model; the clip renders inside the
 * node's video content card. Fully synthetic — a tiny inline WebM stands in for
 * the generated video, so it replays with no backend or credits.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages } from "../castHelpers";
import { SAMPLE_VIDEO_WEBM_DATA_URI } from "../assets/sampleMedia";
import {
  OUTPUT_NODE_TYPE,
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  outputMeta,
  stringInputMeta,
  videoNodeMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const KLING = "fal.text_to_video.KlingVideoV16ProTextToVideo";

const WF = "wf-cookbook-text-to-video";
const JOB = "cookbook-text-to-video-job";
const m = castMessages(WF, JOB);

const PROMPT = "A neon city at night, flying cars drifting between towers, cinematic.";
const video = { type: "video", uri: SAMPLE_VIDEO_WEBM_DATA_URI, metadata: { format: "webm" } };

const nodes = [
  node("prompt", STRING_INPUT, 0, 170, 300, "Prompt", { name: "prompt", value: PROMPT }),
  node("kling", KLING, 460, 170, 320, "Text To Video", { prompt: PROMPT }),
  node("output", OUTPUT_NODE_TYPE, 900, 170, 280, "Output", { name: "video" }),
];
const edges = [
  edge("e1", "prompt", "output", "kling", "prompt"),
  edge("e2", "kling", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "prompt", "Prompt", STRING_INPUT, "running"),
  m.nodeUpdate(1500, "prompt", "Prompt", STRING_INPUT, "completed", { output: PROMPT }),
  m.edgeUpdate(1800, "e1", "active"),

  m.nodeUpdate(2400, "kling", "Text To Video", KLING, "running"),
  ...m.progress("kling", 16, 2900, 6000),
  m.nodeUpdate(9300, "kling", "Text To Video", KLING, "completed", { output: video }),
  m.edgeUpdate(9500, "e1", "completed"),
  m.edgeUpdate(9700, "e2", "active"),

  m.nodeUpdate(10300, "output", "Output", OUTPUT_NODE_TYPE, "running"),
  m.output(10700, "output", "Output", "value", video, "video"),
  m.nodeUpdate(11100, "output", "Output", OUTPUT_NODE_TYPE, "completed", { value: video }),
  m.edgeUpdate(11300, "e2", "completed"),
  m.jobUpdate(11600, "completed", { outputs: { video } }),
];

export const textToVideoCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-text-to-video",
  name: "Text to Video",
  description: "Turn a single prompt into a cinematic clip with a text-to-video model.",
  createdAt: new Date(0).toISOString(),
  durationMs: 13500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Text to Video",
    "Prompt → Kling Text To Video → Output.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [KLING]: videoNodeMeta(KLING, "Text To Video"),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
