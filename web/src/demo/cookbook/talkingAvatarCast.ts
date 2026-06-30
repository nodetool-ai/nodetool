/**
 * Cookbook Pattern 13 — Talking Avatar Generation.
 *
 *   Face Photo ┐
 *              ┼→ AI Avatar (Kling V2 Pro) → Output
 *   Speech ────┘
 *
 * A portrait plus a speech track produce a lip-synced avatar clip in the node's
 * video content card. Fully synthetic — the kitten image, a tiny inline WAV, and
 * a tiny inline WebM stand in for the run.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "../assets/exampleImage";
import { SAMPLE_AUDIO_WAV_DATA_URI, SAMPLE_VIDEO_WEBM_DATA_URI } from "../assets/sampleMedia";
import {
  OUTPUT_NODE_TYPE,
  audioInputMeta,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageInputMeta,
  node,
  outputMeta,
  videoNodeMeta,
} from "./builders";

const IMAGE_INPUT = "nodetool.input.ImageInput";
const AUDIO_INPUT = "nodetool.input.AudioInput";
const AVATAR = "fal.image_to_video.KlingVideoAiAvatarV2Pro";

const WF = "wf-cookbook-talking-avatar";
const JOB = "cookbook-talking-avatar-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };
const audio = { type: "audio", uri: SAMPLE_AUDIO_WAV_DATA_URI, metadata: { format: "wav" } };
const video = { type: "video", uri: SAMPLE_VIDEO_WEBM_DATA_URI, metadata: { format: "webm" } };

const nodes = [
  node("face", IMAGE_INPUT, 0, 40, 300, "Face Photo", { name: "face", value: image }),
  node("speech", AUDIO_INPUT, 0, 320, 300, "Speech", { name: "speech", value: audio }),
  node("avatar", AVATAR, 460, 170, 320, "AI Avatar", {}),
  node("output", OUTPUT_NODE_TYPE, 900, 170, 280, "Output", { name: "video" }),
];
const edges = [
  edge("e1", "face", "output", "avatar", "image"),
  edge("e2", "speech", "output", "avatar", "audio"),
  edge("e3", "avatar", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "face", "Face Photo", IMAGE_INPUT, "running"),
  m.nodeUpdate(400, "speech", "Speech", AUDIO_INPUT, "running"),
  m.nodeUpdate(1400, "face", "Face Photo", IMAGE_INPUT, "completed", { output: image }),
  m.nodeUpdate(1500, "speech", "Speech", AUDIO_INPUT, "completed", { output: audio }),
  m.edgeUpdate(1700, "e1", "active"),
  m.edgeUpdate(1800, "e2", "active"),

  m.nodeUpdate(2400, "avatar", "AI Avatar", AVATAR, "running"),
  ...m.progress("avatar", 16, 2900, 6500),
  m.nodeUpdate(9800, "avatar", "AI Avatar", AVATAR, "completed", { output: video }),
  m.edgeUpdate(10000, "e1", "completed"),
  m.edgeUpdate(10100, "e2", "completed"),
  m.edgeUpdate(10300, "e3", "active"),

  m.nodeUpdate(10900, "output", "Output", OUTPUT_NODE_TYPE, "running"),
  m.output(11300, "output", "Output", "value", video, "video"),
  m.nodeUpdate(11700, "output", "Output", OUTPUT_NODE_TYPE, "completed", { value: video }),
  m.edgeUpdate(11900, "e3", "completed"),
  m.jobUpdate(12200, "completed", { outputs: { video } }),
];

export const talkingAvatarCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-talking-avatar",
  name: "Talking Avatar",
  description: "Drive a portrait with a speech track to produce a lip-synced avatar clip.",
  createdAt: new Date(0).toISOString(),
  durationMs: 14000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Talking Avatar",
    "Face + Speech → Kling AI Avatar → Output.",
    nodes,
    edges
  ),
  metadata: {
    [IMAGE_INPUT]: imageInputMeta(),
    [AUDIO_INPUT]: audioInputMeta(),
    [AVATAR]: videoNodeMeta(AVATAR, "AI Avatar", [prop("image", "image"), prop("audio", "audio")]),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
