/**
 * Cookbook Pattern 8 — Multi-Modal Workflows (Audio to Image).
 *
 *   Audio Input → Transcribe (Whisper) → Text To Image → Output
 *
 * A cross-modal chain: speech is transcribed to text, and the transcript drives
 * an image generator. Fully synthetic — a tiny inline track, a streamed
 * transcript, and the kitten image stand in for the run.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { AUDIO_DREAM_IMAGE_DATA_URI } from "../assets/cookbookImages";
import { SAMPLE_AUDIO_WAV_DATA_URI } from "../assets/sampleMedia";
import {
  OUTPUT_NODE_TYPE,
  audioInputMeta,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageNodeMeta,
  node,
  outputMeta,
  textAgentMeta,
} from "./builders";

const AUDIO_INPUT = "nodetool.input.AudioInput";
const TRANSCRIBE = "openai.audio.Transcribe";
const TEXT_TO_IMAGE = "nodetool.image.TextToImage";

const WF = "wf-cookbook-audio-to-image";
const JOB = "cookbook-audio-to-image-job";
const m = castMessages(WF, JOB);

const audio = { type: "audio", uri: SAMPLE_AUDIO_WAV_DATA_URI, metadata: { format: "wav" } };
const image = { type: "image", uri: AUDIO_DREAM_IMAGE_DATA_URI };

const TRANSCRIPT_TOKENS = [
  "A fluffy ginger kitten ",
  "on a sunny cobblestone street, ",
  "holding a sign ",
  'that reads "hello world".',
];
const TRANSCRIPT = TRANSCRIPT_TOKENS.join("");

const nodes = [
  node("clip", AUDIO_INPUT, 0, 170, 300, "Audio", { name: "clip", value: audio }),
  node("transcribe", TRANSCRIBE, 460, 170, 300, "Transcribe", {}),
  node("image", TEXT_TO_IMAGE, 880, 170, 300, "Text To Image", { prompt: "" }),
  node("output", OUTPUT_NODE_TYPE, 1280, 170, 280, "Output", { name: "image" }),
];
const edges = [
  edge("e1", "clip", "output", "transcribe", "audio"),
  edge("e2", "transcribe", "text", "image", "prompt"),
  edge("e3", "image", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "clip", "Audio", AUDIO_INPUT, "running"),
  m.nodeUpdate(1400, "clip", "Audio", AUDIO_INPUT, "completed", { output: audio }),
  m.edgeUpdate(1700, "e1", "active"),

  m.nodeUpdate(2400, "transcribe", "Transcribe", TRANSCRIBE, "running"),
  ...m.stream("transcribe", TRANSCRIPT_TOKENS, 2900, 4200),
  m.nodeUpdate(7300, "transcribe", "Transcribe", TRANSCRIBE, "completed", { text: TRANSCRIPT }),
  m.edgeUpdate(7500, "e1", "completed"),
  m.edgeUpdate(7700, "e2", "active"),

  m.nodeUpdate(8300, "image", "Text To Image", TEXT_TO_IMAGE, "running"),
  ...m.progress("image", 12, 8700, 3600),
  m.nodeUpdate(12600, "image", "Text To Image", TEXT_TO_IMAGE, "completed", { output: image }),
  m.edgeUpdate(12800, "e2", "completed"),
  m.edgeUpdate(13000, "e3", "active"),

  m.nodeUpdate(13600, "output", "Output", OUTPUT_NODE_TYPE, "running"),
  m.output(14000, "output", "Output", "value", image, "image"),
  m.nodeUpdate(14400, "output", "Output", OUTPUT_NODE_TYPE, "completed", { value: image }),
  m.edgeUpdate(14600, "e3", "completed"),
  m.jobUpdate(14900, "completed", { outputs: { image } }),
];

export const audioToImageCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-audio-to-image",
  name: "Audio to Image",
  description: "Transcribe speech to text, then generate an image from the transcript.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Audio to Image",
    "Audio → Transcribe → Text To Image → Output.",
    nodes,
    edges
  ),
  metadata: {
    [AUDIO_INPUT]: audioInputMeta(),
    [TRANSCRIBE]: textAgentMeta(
      TRANSCRIBE,
      "Transcribe",
      [prop("audio", "audio"), prop("model", "language_model")],
      ["audio"]
    ),
    [TEXT_TO_IMAGE]: imageNodeMeta(TEXT_TO_IMAGE, "Text To Image"),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
