/**
 * Creative pattern 8: a Code node for the parts a model should not do.
 *
 *   Video Input → Extract Audio → Speech Recognition → Code (slugify) → Output
 *
 * The narration is transcribed, and one Code node turns it into a file name.
 * Fully synthetic: the clip is the first line of the English presenter from
 * the multilingual dubbing recipe (demo/public/casts/cookbook-code-glue).
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import {
  OUTPUT_NODE_TYPE,
  assetRef,
  castAssets,
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  outputMeta,
  simpleMeta,
  textAgentMeta,
} from "./builders";

const VIDEO_INPUT = "nodetool.input.VideoInput";
const EXTRACT_AUDIO = "nodetool.video.ExtractAudio";
const ASR = "nodetool.text.AutomaticSpeechRecognition";
const CODE = "nodetool.code.Code";

const WF = "wf-cookbook-code-glue";
const JOB = "cookbook-code-glue-job";
const m = castMessages(WF, JOB);

const CLIP = assetRef("video", "clip.webm");
const AUDIO = assetRef("audio", "audio.mp3");

const TRANSCRIPT_TOKENS = [
  "Start with a short brief. ",
  "Review the words, ",
  "choose a voice, ",
  "and listen before you export.",
];
const TRANSCRIPT = TRANSCRIPT_TOKENS.join("");

const SLUGIFY = [
  "const words = String(inputs.text)",
  "  .toLowerCase()",
  "  .replace(/[^a-z0-9\\s]/g, \"\")",
  "  .split(/\\s+/)",
  "  .slice(0, 5);",
  "return { output: `${words.join(\"-\")}.mp4` };",
].join("\n");
const FILENAME = "start-with-a-short-brief.mp4";

const nodes = [
  node("clip", VIDEO_INPUT, 0, 40, 320, "Clip", { name: "clip", value: CLIP }),
  node("audio", EXTRACT_AUDIO, 400, 80, 260, "Extract Audio", {}),
  node("asr", ASR, 740, 40, 320, "Speech Recognition", {}),
  node("code", CODE, 1140, 40, 380, "Slugify", { code: SLUGIFY }),
  node("output", OUTPUT_NODE_TYPE, 1600, 80, 320, "Filename", { name: "filename" }),
];
const edges = [
  edge("e1", "clip", "output", "audio", "video"),
  edge("e2", "audio", "output", "asr", "audio"),
  edge("e3", "asr", "text", "code", "text"),
  edge("e4", "code", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "clip", "Clip", VIDEO_INPUT, "running"),
  m.nodeUpdate(800, "clip", "Clip", VIDEO_INPUT, "completed", { output: CLIP }),
  m.edgeUpdate(900, "e1", "active"),

  m.nodeUpdate(1200, "audio", "Extract Audio", EXTRACT_AUDIO, "running"),
  m.nodeUpdate(1800, "audio", "Extract Audio", EXTRACT_AUDIO, "completed", { output: AUDIO }),
  m.edgeUpdate(1900, "e1", "completed"),
  m.edgeUpdate(2000, "e2", "active"),

  m.nodeUpdate(2200, "asr", "Speech Recognition", ASR, "running"),
  ...m.stream("asr", TRANSCRIPT_TOKENS, 2400, 1400),
  m.nodeUpdate(3900, "asr", "Speech Recognition", ASR, "completed", { text: TRANSCRIPT }),
  m.edgeUpdate(4000, "e2", "completed"),
  m.edgeUpdate(4100, "e3", "active"),

  m.nodeUpdate(4300, "code", "Slugify", CODE, "running"),
  m.nodeUpdate(4700, "code", "Slugify", CODE, "completed", { output: FILENAME }),
  m.edgeUpdate(4800, "e3", "completed"),
  m.edgeUpdate(4900, "e4", "active"),

  m.nodeUpdate(5000, "output", "Filename", OUTPUT_NODE_TYPE, "running"),
  m.output(5200, "output", "Filename", "value", FILENAME, "str"),
  m.nodeUpdate(5400, "output", "Filename", OUTPUT_NODE_TYPE, "completed", { value: FILENAME }),
  m.edgeUpdate(5500, "e4", "completed"),
  m.jobUpdate(5600, "completed", { outputs: { filename: FILENAME } }),
];

export const codeGlueCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-code-glue",
  name: "Code Node Glue",
  description: "Transcribe a clip's narration and slugify it into a file name.",
  createdAt: new Date(0).toISOString(),
  durationMs: 9000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Code Node Glue",
    "Video Input → Extract Audio → Speech Recognition → Code → Output.",
    nodes,
    edges
  ),
  metadata: {
    [VIDEO_INPUT]: meta({
      node_type: VIDEO_INPUT,
      title: "Video Input",
      properties: [prop("name", "str"), prop("value", "video")],
      outputs: [out("output", "video")],
      inline_fields: ["value"],
      input_fields: [],
    }),
    [EXTRACT_AUDIO]: simpleMeta(EXTRACT_AUDIO, "Extract Audio", "audio", {
      inputs: ["video"],
      properties: [prop("video", "video")],
    }),
    [ASR]: {
      ...textAgentMeta(ASR, "Automatic Speech Recognition", [prop("audio", "audio")], ["audio"]),
      outputs: [out("text", "str"), out("chunk", "chunk", true)],
    },
    [CODE]: simpleMeta(CODE, "Code", "str", {
      inputs: ["text"],
      inline: ["code"],
      properties: [prop("code", "str"), prop("text", "str")],
    }),
    [OUTPUT_NODE_TYPE]: outputMeta("Filename"),
  },
  events,
  assets: castAssets(["clip.webm", "audio.mp3"]),
  viewport: fitViewport(nodes),
};
