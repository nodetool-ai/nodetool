/**
 * Workflow gallery — Transcribe Audio.
 *
 *   Audio Input → Automatic Speech Recognition → Output
 *
 * Speech-to-text with a Whisper-class model. Fully synthetic — a tiny inline
 * track and a streamed transcript stand in for the run, so it replays with no
 * backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { SAMPLE_AUDIO_WAV_DATA_URI } from "../assets/sampleMedia";
import {
  OUTPUT_NODE_TYPE,
  audioInputMeta,
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  outputMeta,
  textAgentMeta,
} from "../cookbook/builders";

const AUDIO_INPUT = "nodetool.input.AudioInput";
const ASR = "nodetool.text.AutomaticSpeechRecognition";

const WF = "wf-workflow-transcribe-audio";
const JOB = "workflow-transcribe-audio-job";
const m = castMessages(WF, JOB);

const audio = { type: "audio", uri: SAMPLE_AUDIO_WAV_DATA_URI, metadata: { format: "wav" } };

const TRANSCRIPT_TOKENS = [
  "Thanks everyone for joining. ",
  "Today we shipped the new workflow gallery, ",
  "and next sprint we tackle the video pipeline. ",
  "Action items are in the notes.",
];
const TRANSCRIPT = TRANSCRIPT_TOKENS.join("");

const nodes = [
  node("clip", AUDIO_INPUT, 0, 170, 300, "Audio", { name: "clip", value: audio }),
  node("asr", ASR, 460, 170, 320, "Transcribe", {}),
  node("output", OUTPUT_NODE_TYPE, 900, 170, 300, "Transcript", { name: "transcript" }),
];
const edges = [
  edge("e1", "clip", "output", "asr", "audio"),
  edge("e2", "asr", "text", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "clip", "Audio", AUDIO_INPUT, "running"),
  m.nodeUpdate(1400, "clip", "Audio", AUDIO_INPUT, "completed", { output: audio }),
  m.edgeUpdate(1700, "e1", "active"),

  m.nodeUpdate(2400, "asr", "Transcribe", ASR, "running"),
  ...m.stream("asr", TRANSCRIPT_TOKENS, 2900, 5000),
  m.nodeUpdate(8300, "asr", "Transcribe", ASR, "completed", { text: TRANSCRIPT }),
  m.edgeUpdate(8500, "e1", "completed"),
  m.edgeUpdate(8700, "e2", "active"),

  m.nodeUpdate(9300, "output", "Transcript", OUTPUT_NODE_TYPE, "running"),
  m.output(9700, "output", "Transcript", "value", TRANSCRIPT, "str"),
  m.nodeUpdate(10100, "output", "Transcript", OUTPUT_NODE_TYPE, "completed", { value: TRANSCRIPT }),
  m.edgeUpdate(10300, "e2", "completed"),
  m.jobUpdate(10600, "completed", { outputs: { transcript: TRANSCRIPT } }),
];

export const transcribeAudioCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-transcribe-audio",
  name: "Transcribe Audio",
  description: "Convert speech to text with an automatic speech recognition model.",
  createdAt: new Date(0).toISOString(),
  durationMs: 12000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Transcribe Audio",
    "Audio Input → Automatic Speech Recognition → Output.",
    nodes,
    edges
  ),
  metadata: {
    [AUDIO_INPUT]: audioInputMeta(),
    [ASR]: textAgentMeta(
      ASR,
      "Transcribe",
      [prop("audio", "audio"), prop("model", "asr_model")],
      ["audio"]
    ),
    [OUTPUT_NODE_TYPE]: outputMeta("Transcript"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
