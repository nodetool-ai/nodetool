/**
 * Cookbook Pattern 2 — Agent-Driven Generation (Image to Story).
 *
 *   Image Input → Agent (vision, streaming story) → Text To Speech → Preview
 *
 * A picture flows into a vision Agent that writes a short story about it
 * (streaming into its text card), then a Text To Speech node narrates it into an
 * audio card. Fully synthetic: the kitten image, streamed text, and a tiny
 * inline WAV chime stand in for the generated narration.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "../assets/exampleImage";
import { SAMPLE_AUDIO_WAV_DATA_URI } from "../assets/sampleMedia";
import {
  audioNodeMeta,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageInputMeta,
  node,
  previewMeta,
  textAgentMeta,
} from "./builders";

const IMAGE_INPUT = "nodetool.input.ImageInput";
const AGENT = "nodetool.agents.Agent";
const TTS = "nodetool.audio.TextToSpeech";

const WF = "wf-cookbook-image-to-story";
const JOB = "cookbook-image-to-story-job";
const m = castMessages(WF, JOB);

const image = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };
const audio = { type: "audio", uri: SAMPLE_AUDIO_WAV_DATA_URI, metadata: { format: "wav" } };

const STORY_TOKENS = [
  "On a sunny cobblestone street, ",
  "a small ginger kitten ",
  "held up a cardboard sign ",
  'that read "HELLO WORLD". ',
  "Passers-by smiled, ",
  "and for one bright morning ",
  "the whole town felt new.",
];
const STORY = STORY_TOKENS.join("");

const nodes = [
  node("photo", IMAGE_INPUT, 0, 170, 300, "Photo", { name: "photo", value: image }),
  node("story", AGENT, 460, 170, 320, "Story Writer", { prompt: "Write a short story about this image." }),
  node("speak", TTS, 880, 170, 300, "Text To Speech", { text: "" }),
  node("preview", PREVIEW_NODE_TYPE, 1280, 170, 300, "Narration", {}),
];
const edges = [
  edge("e1", "photo", "output", "story", "image"),
  edge("e2", "story", "text", "speak", "text"),
  edge("e3", "speak", "audio", "preview", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "photo", "Photo", IMAGE_INPUT, "running"),
  m.nodeUpdate(1400, "photo", "Photo", IMAGE_INPUT, "completed", { output: image }),
  m.edgeUpdate(1700, "e1", "active"),

  m.nodeUpdate(2400, "story", "Story Writer", AGENT, "running"),
  ...m.stream("story", STORY_TOKENS, 2900, 6000),
  m.nodeUpdate(9300, "story", "Story Writer", AGENT, "completed", { text: STORY }),
  m.edgeUpdate(9500, "e1", "completed"),
  m.edgeUpdate(9700, "e2", "active"),

  m.nodeUpdate(10300, "speak", "Text To Speech", TTS, "running"),
  ...m.progress("speak", 10, 10700, 2200),
  m.nodeUpdate(13200, "speak", "Text To Speech", TTS, "completed", { audio }),
  m.edgeUpdate(13400, "e2", "completed"),
  m.edgeUpdate(13600, "e3", "active"),

  m.nodeUpdate(14200, "preview", "Narration", PREVIEW_NODE_TYPE, "running"),
  m.output(14700, "preview", "Narration", "value", audio, "audio"),
  m.nodeUpdate(15200, "preview", "Narration", PREVIEW_NODE_TYPE, "completed", { value: audio }),
  m.edgeUpdate(15400, "e3", "completed"),
  m.jobUpdate(15700, "completed", { outputs: { value: audio } }),
];

export const imageToStoryCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-image-to-story",
  name: "Image to Story",
  description: "A vision Agent writes a story about an image, then narrates it aloud.",
  createdAt: new Date(0).toISOString(),
  durationMs: 18000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Image to Story",
    "Image → Agent (vision) → Text To Speech → Preview.",
    nodes,
    edges
  ),
  metadata: {
    [IMAGE_INPUT]: imageInputMeta(),
    [AGENT]: textAgentMeta(
      AGENT,
      "Agent",
      [prop("prompt", "str"), prop("image", "image"), prop("model", "language_model")],
      ["prompt", "image"]
    ),
    [TTS]: audioNodeMeta(TTS, "Text To Speech", [prop("text", "str"), prop("model", "language_model")]),
    [PREVIEW_NODE_TYPE]: previewMeta("Narration"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
