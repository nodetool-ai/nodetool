/**
 * Creative pattern 7: derivatives from a finished cut.
 *
 *   Timeline → Transcript → Agent → Output (Copy)
 *   Timeline → Retarget Timeline (9:16) → Render Timeline → Add Subtitles → Output
 *                                         Render Timeline → Extract Audio → Transcribe ↗
 *
 * The approved cut feeds two branches: its transcript lines become titles and
 * a post, and a 9:16 retarget renders, gets transcribed, and gets captions
 * burned in. Fully synthetic: the master, the vertical render, and the
 * captioned render come from the English presenter of the multilingual dubbing
 * recipe (demo/public/casts/cookbook-derivatives).
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
  videoNodeMeta,
} from "./builders";

const TIMELINE = "nodetool.constant.Timeline";
const TRANSCRIPT = "nodetool.timeline.Transcript";
const AGENT = "nodetool.agents.Agent";
const RETARGET = "nodetool.timeline.RetargetTimeline";
const RENDER = "nodetool.timeline.RenderTimeline";
const EXTRACT_AUDIO = "nodetool.video.ExtractAudio";
const TRANSCRIBE = "openai.audio.Transcribe";
const ADD_SUBTITLES = "nodetool.video.AddSubtitles";

const WF = "wf-cookbook-derivatives";
const JOB = "cookbook-derivatives-job";
const m = castMessages(WF, JOB);

const MASTER = assetRef("video", "master.webm");
const VERTICAL = assetRef("video", "vertical.webm");
const CAPTIONED = assetRef("video", "captioned.webm");
const AUDIO = assetRef("audio", "audio.mp3");

const TRANSCRIPT_TEXT =
  "Start with a short brief. Review the words, choose a voice, and listen before you export. " +
  "When one line needs a change, edit that line and record it again. " +
  "Your script stays editable, so the next version starts from work you already have.";

const COPY_TOKENS = [
  "TITLE: Edit One Line, Not the Whole Video\n\n",
  "NOTES: Write a brief, pick a voice, ",
  "and re-record only the line that changed.\n\n",
  "POST: Changed one sentence? ",
  "Re-voice that line and ship the new cut.",
];
const COPY = COPY_TOKENS.join("");

const nodes = [
  node("master", TIMELINE, 0, 200, 340, "Master Cut", { video: MASTER }),
  node("transcript", TRANSCRIPT, 420, 0, 260, "Transcript", {}),
  node("agent", AGENT, 760, 0, 320, "Agent", { prompt: "" }),
  node("copy", OUTPUT_NODE_TYPE, 1160, 0, 340, "Copy", { name: "copy" }),
  node("retarget", RETARGET, 420, 420, 260, "Retarget 9:16", {
    aspect_ratio: "9:16",
    fit: "cover",
  }),
  node("render", RENDER, 760, 380, 220, "Render Timeline", {}),
  node("audio", EXTRACT_AUDIO, 1060, 760, 280, "Extract Audio", {}),
  node("transcribe", TRANSCRIBE, 1420, 740, 300, "Transcribe", {}),
  node("subtitles", ADD_SUBTITLES, 1420, 380, 220, "Add Subtitles", {}),
  node("vertical", OUTPUT_NODE_TYPE, 1720, 380, 220, "Vertical Cut", { name: "vertical" }),
];
const edges = [
  edge("e1", "master", "output", "transcript", "timeline"),
  edge("e2", "transcript", "text", "agent", "prompt"),
  edge("e3", "agent", "text", "copy", "value"),
  edge("e4", "master", "output", "retarget", "timeline"),
  edge("e5", "retarget", "timeline", "render", "timeline"),
  edge("e6", "render", "output", "subtitles", "video"),
  edge("e7", "render", "output", "audio", "video"),
  edge("e8", "audio", "output", "transcribe", "audio"),
  edge("e9", "transcribe", "segments", "subtitles", "chunks"),
  edge("e10", "subtitles", "output", "vertical", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "master", "Master Cut", TIMELINE, "running"),
  m.nodeUpdate(800, "master", "Master Cut", TIMELINE, "completed", { output: MASTER }),
  m.edgeUpdate(900, "e1", "active"),
  m.edgeUpdate(900, "e4", "active"),

  // Copy branch: transcript lines → titles, notes, and a post.
  m.nodeUpdate(1200, "transcript", "Transcript", TRANSCRIPT, "running"),
  m.nodeUpdate(1600, "transcript", "Transcript", TRANSCRIPT, "completed", {
    text: TRANSCRIPT_TEXT,
  }),
  m.edgeUpdate(1700, "e1", "completed"),
  m.edgeUpdate(1800, "e2", "active"),
  m.nodeUpdate(1900, "agent", "Agent", AGENT, "running"),
  ...m.stream("agent", COPY_TOKENS, 2100, 2200),
  m.nodeUpdate(4400, "agent", "Agent", AGENT, "completed", { text: COPY }),
  m.edgeUpdate(4500, "e2", "completed"),
  m.edgeUpdate(4600, "e3", "active"),
  m.nodeUpdate(4700, "copy", "Copy", OUTPUT_NODE_TYPE, "running"),
  m.output(4800, "copy", "Copy", "value", COPY, "str"),
  m.nodeUpdate(4900, "copy", "Copy", OUTPUT_NODE_TYPE, "completed", { value: COPY }),
  m.edgeUpdate(5000, "e3", "completed"),

  // Vertical branch: retarget, render, transcribe, burn captions.
  m.nodeUpdate(5200, "retarget", "Retarget 9:16", RETARGET, "running"),
  m.nodeUpdate(5600, "retarget", "Retarget 9:16", RETARGET, "completed", { cropped: [] }),
  m.edgeUpdate(5700, "e4", "completed"),
  m.edgeUpdate(5800, "e5", "active"),
  m.nodeUpdate(5900, "render", "Render Timeline", RENDER, "running"),
  ...m.progress("render", 36, 6000, 1200),
  m.nodeUpdate(7300, "render", "Render Timeline", RENDER, "completed", { output: VERTICAL }),
  m.edgeUpdate(7400, "e5", "completed"),
  m.edgeUpdate(7500, "e6", "active"),
  m.edgeUpdate(7500, "e7", "active"),
  m.nodeUpdate(7600, "audio", "Extract Audio", EXTRACT_AUDIO, "running"),
  m.nodeUpdate(8000, "audio", "Extract Audio", EXTRACT_AUDIO, "completed", { output: AUDIO }),
  m.edgeUpdate(8100, "e7", "completed"),
  m.edgeUpdate(8200, "e8", "active"),
  m.nodeUpdate(8300, "transcribe", "Transcribe", TRANSCRIBE, "running"),
  m.nodeUpdate(9300, "transcribe", "Transcribe", TRANSCRIBE, "completed", {
    text: TRANSCRIPT_TEXT,
  }),
  m.edgeUpdate(9400, "e8", "completed"),
  m.edgeUpdate(9500, "e9", "active"),
  m.nodeUpdate(9600, "subtitles", "Add Subtitles", ADD_SUBTITLES, "running"),
  ...m.progress("subtitles", 30, 9700, 1000),
  m.nodeUpdate(10800, "subtitles", "Add Subtitles", ADD_SUBTITLES, "completed", {
    output: CAPTIONED,
  }),
  m.edgeUpdate(10900, "e6", "completed"),
  m.edgeUpdate(10900, "e9", "completed"),
  m.edgeUpdate(11000, "e10", "active"),
  m.nodeUpdate(11100, "vertical", "Vertical Cut", OUTPUT_NODE_TYPE, "running"),
  m.output(11300, "vertical", "Vertical Cut", "value", CAPTIONED, "video"),
  m.nodeUpdate(11500, "vertical", "Vertical Cut", OUTPUT_NODE_TYPE, "completed", {
    value: CAPTIONED,
  }),
  m.edgeUpdate(11600, "e10", "completed"),
  m.jobUpdate(11700, "completed", { outputs: { copy: COPY, vertical: CAPTIONED } }),
];

export const derivativesCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-derivatives",
  name: "Derivatives from a Finished Cut",
  description: "Turn one master into copy and a captioned vertical cut.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Derivatives from a Finished Cut",
    "Timeline → Transcript → Agent, and Timeline → Retarget → Render → Add Subtitles.",
    nodes,
    edges
  ),
  metadata: {
    [TIMELINE]: meta({
      node_type: TIMELINE,
      title: "Timeline",
      body: "content_card",
      properties: [prop("value", "timeline"), prop("video", "video")],
      outputs: [out("output", "video")],
      inline_fields: [],
      input_fields: ["video"],
    }),
    [TRANSCRIPT]: meta({
      node_type: TRANSCRIPT,
      title: "Timeline Transcript",
      properties: [prop("timeline", "timeline")],
      outputs: [out("text", "str"), out("lines", "list")],
      input_fields: ["timeline"],
    }),
    [AGENT]: textAgentMeta(AGENT, "Agent"),
    [RETARGET]: meta({
      node_type: RETARGET,
      title: "Retarget Timeline",
      properties: [prop("timeline", "timeline"), prop("aspect_ratio", "str"), prop("fit", "str")],
      outputs: [out("timeline", "timeline"), out("cropped", "list")],
      inline_fields: ["aspect_ratio", "fit"],
      input_fields: ["timeline"],
    }),
    [RENDER]: videoNodeMeta(RENDER, "Render Timeline", [prop("timeline", "timeline")]),
    [EXTRACT_AUDIO]: simpleMeta(EXTRACT_AUDIO, "Extract Audio", "audio", {
      inputs: ["video"],
      properties: [prop("video", "video")],
    }),
    [TRANSCRIBE]: {
      ...textAgentMeta(TRANSCRIBE, "Transcribe", [prop("audio", "audio")], ["audio"]),
      outputs: [out("text", "str"), out("segments", "list")],
      is_streaming_output: false,
    },
    [ADD_SUBTITLES]: videoNodeMeta(ADD_SUBTITLES, "Add Subtitles", [
      prop("video", "video"),
      prop("chunks", "list"),
    ]),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: castAssets(["master.webm", "vertical.webm", "captioned.webm", "audio.mp3"]),
  viewport: fitViewport(nodes),
};
