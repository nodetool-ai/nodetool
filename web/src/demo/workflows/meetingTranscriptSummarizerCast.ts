/**
 * Workflow gallery — Meeting Transcript Summarizer.
 *
 *   Audio → Automatic Speech Recognition → Summarizer → Notes
 *
 * Transcribe a recording, then stream concise notes from the transcript. Fully
 * synthetic — a tiny inline track, a canned transcript, and a streamed summary
 * stand in for the run, so it replays with no backend.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { SAMPLE_AUDIO_WAV_DATA_URI } from "../assets/sampleMedia";
import {
  audioInputMeta,
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  previewMeta,
  textAgentMeta,
} from "../cookbook/builders";

const AUDIO_INPUT = "nodetool.input.AudioInput";
const ASR = "nodetool.text.AutomaticSpeechRecognition";
const SUMMARIZER = "nodetool.agents.Summarizer";

const WF = "wf-workflow-meeting-transcript-summarizer";
const JOB = "workflow-meeting-transcript-summarizer-job";
const m = castMessages(WF, JOB);

const audio = { type: "audio", uri: SAMPLE_AUDIO_WAV_DATA_URI, metadata: { format: "wav" } };

const TRANSCRIPT_TOKENS = [
  "So the launch is set for Thursday. ",
  "Marketing needs final copy by Tuesday, ",
  "engineering will freeze the build Wednesday night, ",
  "and support gets the runbook a day early.",
];
const TRANSCRIPT = TRANSCRIPT_TOKENS.join("");
const NOTES_TOKENS = [
  "• Launch Thursday.\n",
  "• Marketing: final copy due Tuesday.\n",
  "• Engineering: build freeze Wednesday night.\n",
  "• Support: runbook one day early.",
];
const NOTES = NOTES_TOKENS.join("");

const nodes = [
  node("audio", AUDIO_INPUT, 0, 170, 300, "Recording", { name: "recording", value: audio }),
  node("asr", ASR, 440, 170, 320, "Transcribe", {}),
  node("summarizer", SUMMARIZER, 860, 170, 320, "Summarize", { text: "" }),
  node("notes", PREVIEW_NODE_TYPE, 1260, 170, 320, "Meeting Notes", {}),
];
const edges = [
  edge("e1", "audio", "output", "asr", "audio"),
  edge("e2", "asr", "text", "summarizer", "text"),
  edge("e3", "summarizer", "text", "notes", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "audio", "Recording", AUDIO_INPUT, "running"),
  m.nodeUpdate(1400, "audio", "Recording", AUDIO_INPUT, "completed", { output: audio }),
  m.edgeUpdate(1700, "e1", "active"),

  m.nodeUpdate(2400, "asr", "Transcribe", ASR, "running"),
  ...m.stream("asr", TRANSCRIPT_TOKENS, 2900, 4200),
  m.nodeUpdate(7500, "asr", "Transcribe", ASR, "completed", { text: TRANSCRIPT }),
  m.edgeUpdate(7700, "e1", "completed"),
  m.edgeUpdate(7900, "e2", "active"),

  m.nodeUpdate(8500, "summarizer", "Summarize", SUMMARIZER, "running"),
  ...m.stream("summarizer", NOTES_TOKENS, 9000, 4200),
  m.nodeUpdate(13700, "summarizer", "Summarize", SUMMARIZER, "completed", { text: NOTES }),
  m.edgeUpdate(13900, "e2", "completed"),
  m.edgeUpdate(14100, "e3", "active"),

  m.nodeUpdate(14700, "notes", "Meeting Notes", PREVIEW_NODE_TYPE, "running"),
  m.output(15100, "notes", "Meeting Notes", "value", NOTES, "str"),
  m.nodeUpdate(15500, "notes", "Meeting Notes", PREVIEW_NODE_TYPE, "completed", { value: NOTES }),
  m.edgeUpdate(15700, "e3", "completed"),
  m.jobUpdate(16000, "completed", { outputs: { value: NOTES } }),
];

export const meetingTranscriptSummarizerCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-meeting-transcript-summarizer",
  name: "Meeting Transcript Summarizer",
  description: "Transcribe a meeting recording and stream concise notes.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Meeting Transcript Summarizer",
    "Audio → Transcribe → Summarize → Notes.",
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
    [SUMMARIZER]: textAgentMeta(
      SUMMARIZER,
      "Summarize",
      [prop("text", "str"), prop("model", "language_model")],
      ["text"]
    ),
    [PREVIEW_NODE_TYPE]: previewMeta("Meeting Notes"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
