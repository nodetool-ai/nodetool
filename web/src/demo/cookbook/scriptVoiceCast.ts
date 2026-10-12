/**
 * Creative pattern 4: script to voiced cut and captions.
 *
 *   Script → Voice Script → Script To Timeline → Render Timeline → Output (Cut)
 *                         → Script To Subtitles → Output (SRT)
 *
 * Voice Script records a take per line, the takes become a timeline that
 * renders to a cut, and the same takes' timings write the subtitle file.
 * Fully synthetic: the takes and the cut come from the English presenter of
 * the multilingual dubbing recipe (demo/public/casts/cookbook-script-voice).
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import {
  OUTPUT_NODE_TYPE,
  assetRef,
  audioNodeMeta,
  castAssets,
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  outputMeta,
  simpleMeta,
  videoNodeMeta,
} from "./builders";

const SCRIPT = "nodetool.constant.Script";
const VOICE = "nodetool.script.VoiceScript";
const TO_TIMELINE = "nodetool.script.ScriptToTimeline";
const RENDER = "nodetool.timeline.RenderTimeline";
const TO_SUBTITLES = "nodetool.script.ScriptToSubtitles";

const WF = "wf-cookbook-script-voice";
const JOB = "cookbook-script-voice-job";
const m = castMessages(WF, JOB);

const LINES = [
  "Start with a short brief. Review the words, choose a voice, and listen before you export.",
  "When one line needs a change, edit that line and record it again.",
  "Your script stays editable, so the next version starts from work you already have.",
];
const SCRIPT_TEXT = LINES.map((l, i) => `${i + 1}. ${l}`).join("\n");
const TAKES = [1, 2, 3].map((i) => assetRef("audio", `take-${i}.mp3`));
const CUT = assetRef("video", "cut.webm");
const SRT = [
  "1\n00:00:00,000 --> 00:00:09,000\n" + LINES[0],
  "2\n00:00:09,000 --> 00:00:15,500\n" + LINES[1],
  "3\n00:00:15,500 --> 00:00:22,625\n" + LINES[2],
].join("\n\n");

const nodes = [
  node("script", SCRIPT, 0, 40, 320, "Script", { text: SCRIPT_TEXT }),
  node("voice", VOICE, 400, 40, 320, "Voice Script", {}),
  node("timeline", TO_TIMELINE, 800, 60, 240, "Script To Timeline", {}),
  node("render", RENDER, 1120, 20, 340, "Render Timeline", {}),
  node("cut", OUTPUT_NODE_TYPE, 1540, 20, 340, "Cut", { name: "cut" }),
  node("subtitles", TO_SUBTITLES, 800, 400, 260, "Script To Subtitles", {
    format: "srt",
    granularity: "line",
  }),
  node("srt", OUTPUT_NODE_TYPE, 1120, 400, 340, "SRT", { name: "srt" }),
];
const edges = [
  edge("e1", "script", "output", "voice", "script"),
  edge("e2", "voice", "output", "timeline", "script"),
  edge("e3", "timeline", "output", "render", "timeline"),
  edge("e4", "render", "output", "cut", "value"),
  edge("e5", "voice", "output", "subtitles", "script"),
  edge("e6", "subtitles", "subtitles", "srt", "value"),
];

const FIRST_LINE_MS = 1600;
const LINE_GAP_MS = 1300;

/** Voice Script records one line: a ramp, then the take plays on the card. */
const lineEvents = (i: number): CastEvent[] => {
  const t = FIRST_LINE_MS + i * LINE_GAP_MS;
  return [
    ...m.progress("voice", 30, t, 1000),
    m.nodeUpdate(t + 1100, "voice", "Voice Script", VOICE, "completed", {
      output: TAKES[i],
      voiced_count: i + 1,
    }),
    ...(i < 2 ? [m.nodeUpdate(t + 1200, "voice", "Voice Script", VOICE, "running")] : []),
  ];
};

const VOICED_MS = FIRST_LINE_MS + 2 * LINE_GAP_MS + 1100;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "script", "Script", SCRIPT, "running"),
  m.nodeUpdate(800, "script", "Script", SCRIPT, "completed"),
  m.edgeUpdate(900, "e1", "active"),

  m.nodeUpdate(1300, "voice", "Voice Script", VOICE, "running"),
  ...[0, 1, 2].flatMap(lineEvents),
  m.edgeUpdate(VOICED_MS + 100, "e1", "completed"),
  m.edgeUpdate(VOICED_MS + 200, "e2", "active"),
  m.edgeUpdate(VOICED_MS + 200, "e5", "active"),

  m.nodeUpdate(VOICED_MS + 300, "timeline", "Script To Timeline", TO_TIMELINE, "running"),
  m.nodeUpdate(VOICED_MS + 400, "subtitles", "Script To Subtitles", TO_SUBTITLES, "running"),
  m.nodeUpdate(VOICED_MS + 800, "timeline", "Script To Timeline", TO_TIMELINE, "completed"),
  m.nodeUpdate(VOICED_MS + 900, "subtitles", "Script To Subtitles", TO_SUBTITLES, "completed", {
    subtitles: SRT,
    cue_count: 3,
  }),
  m.edgeUpdate(VOICED_MS + 1000, "e2", "completed"),
  m.edgeUpdate(VOICED_MS + 1000, "e5", "completed"),
  m.edgeUpdate(VOICED_MS + 1100, "e3", "active"),
  m.edgeUpdate(VOICED_MS + 1100, "e6", "active"),

  m.nodeUpdate(VOICED_MS + 1200, "srt", "SRT", OUTPUT_NODE_TYPE, "running"),
  m.output(VOICED_MS + 1300, "srt", "SRT", "value", SRT, "str"),
  m.nodeUpdate(VOICED_MS + 1400, "srt", "SRT", OUTPUT_NODE_TYPE, "completed", { value: SRT }),
  m.edgeUpdate(VOICED_MS + 1500, "e6", "completed"),

  m.nodeUpdate(VOICED_MS + 1200, "render", "Render Timeline", RENDER, "running"),
  ...m.progress("render", 36, VOICED_MS + 1300, 1200),
  m.nodeUpdate(VOICED_MS + 2600, "render", "Render Timeline", RENDER, "completed", {
    output: CUT,
  }),
  m.edgeUpdate(VOICED_MS + 2700, "e3", "completed"),
  m.edgeUpdate(VOICED_MS + 2800, "e4", "active"),
  m.nodeUpdate(VOICED_MS + 2900, "cut", "Cut", OUTPUT_NODE_TYPE, "running"),
  m.output(VOICED_MS + 3100, "cut", "Cut", "value", CUT, "video"),
  m.nodeUpdate(VOICED_MS + 3300, "cut", "Cut", OUTPUT_NODE_TYPE, "completed", { value: CUT }),
  m.edgeUpdate(VOICED_MS + 3400, "e4", "completed"),
  m.jobUpdate(VOICED_MS + 3500, "completed", { outputs: { cut: CUT, srt: SRT } }),
];
// Subtitles and the render run side by side.
events.sort((a, b) => a.t - b.t);

export const scriptVoiceCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-script-voice",
  name: "Script to Voiced Cut",
  description: "Voice each script line, render the cut, and write the subtitles.",
  createdAt: new Date(0).toISOString(),
  durationMs: VOICED_MS + 9000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Script to Voiced Cut",
    "Script → Voice Script → Script To Timeline → Render Timeline, and Script To Subtitles.",
    nodes,
    edges
  ),
  metadata: {
    [SCRIPT]: meta({
      node_type: SCRIPT,
      title: "Script",
      properties: [prop("value", "script"), prop("text", "str")],
      outputs: [out("output", "script")],
      inline_fields: ["text"],
      input_fields: [],
    }),
    [VOICE]: {
      ...audioNodeMeta(VOICE, "Voice Script", [prop("script", "script")]),
      outputs: [out("output", "audio"), out("voiced_count", "int")],
    },
    [TO_TIMELINE]: simpleMeta(TO_TIMELINE, "Script To Timeline", "timeline", {
      inputs: ["script"],
      properties: [prop("script", "script")],
    }),
    [RENDER]: videoNodeMeta(RENDER, "Render Timeline", [prop("timeline", "timeline")]),
    [TO_SUBTITLES]: meta({
      node_type: TO_SUBTITLES,
      title: "Script To Subtitles",
      properties: [prop("script", "script"), prop("format", "str"), prop("granularity", "str")],
      outputs: [out("subtitles", "str"), out("cue_count", "int")],
      inline_fields: ["format", "granularity"],
      input_fields: ["script"],
    }),
    [OUTPUT_NODE_TYPE]: outputMeta("Output"),
  },
  events,
  assets: castAssets(["take-1.mp3", "take-2.mp3", "take-3.mp3", "cut.webm"]),
  viewport: fitViewport(nodes),
};
