/**
 * Cookbook Pattern 7 — Realtime Processing (Realtime Agent).
 *
 *   Realtime Audio Input → Realtime Agent → Preview
 *
 * A live voice loop: streaming microphone audio drives a Realtime Agent that
 * streams a spoken/typed reply. Fully synthetic — the mic emits a couple of
 * audio chunks and the agent streams a fixed reply, so it replays with no
 * audio device or backend.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import { SAMPLE_AUDIO_WAV_DATA_URI } from "../assets/sampleMedia";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  previewMeta,
  realtimeAudioInputMeta,
} from "./builders";

const REALTIME_INPUT = "nodetool.input.RealtimeAudioInput";
const REALTIME_AGENT = "openai.agents.RealtimeAgent";

const WF = "wf-cookbook-realtime-agent";
const JOB = "cookbook-realtime-agent-job";
const m = castMessages(WF, JOB);

const audio = { type: "audio", uri: SAMPLE_AUDIO_WAV_DATA_URI, metadata: { format: "wav" } };
const REPLY_TOKENS = [
  "Sure — ",
  "I can hear you. ",
  "The fastest train to the airport ",
  "leaves at 9:40, ",
  "and the trip takes about 25 minutes.",
];
const REPLY = REPLY_TOKENS.join("");

const nodes = [
  node("mic", REALTIME_INPUT, 0, 170, 300, "Microphone", { name: "mic" }),
  node("agent", REALTIME_AGENT, 460, 170, 340, "Realtime Agent", {}),
  node("preview", PREVIEW_NODE_TYPE, 920, 170, 320, "Response", {}),
];
const edges = [
  edge("e1", "mic", "chunk", "agent", "audio"),
  edge("e2", "agent", "text", "preview", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "mic", "Microphone", REALTIME_INPUT, "running"),
  m.output(900, "mic", "Microphone", "chunk", audio, "audio"),
  m.edgeUpdate(1000, "e1", "active"),
  m.output(1600, "mic", "Microphone", "chunk", audio, "audio"),

  m.nodeUpdate(1800, "agent", "Realtime Agent", REALTIME_AGENT, "running"),
  ...m.stream("agent", REPLY_TOKENS, 2300, 5200),
  m.nodeUpdate(7800, "agent", "Realtime Agent", REALTIME_AGENT, "completed", { text: REPLY, audio }),
  m.nodeUpdate(8000, "mic", "Microphone", REALTIME_INPUT, "completed", { output: audio }),
  m.edgeUpdate(8200, "e1", "completed"),
  m.edgeUpdate(8400, "e2", "active"),

  m.nodeUpdate(9000, "preview", "Response", PREVIEW_NODE_TYPE, "running"),
  m.output(9400, "preview", "Response", "value", REPLY, "str"),
  m.nodeUpdate(9800, "preview", "Response", PREVIEW_NODE_TYPE, "completed", { value: REPLY }),
  m.edgeUpdate(10000, "e2", "completed"),
  m.jobUpdate(10300, "completed", { outputs: { value: REPLY } }),
];

export const realtimeAgentCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-realtime-agent",
  name: "Realtime Agent",
  description: "Stream microphone audio into a Realtime Agent and stream a reply back.",
  createdAt: new Date(0).toISOString(),
  durationMs: 12000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Realtime Agent",
    "Realtime Audio Input → Realtime Agent → Preview.",
    nodes,
    edges
  ),
  metadata: {
    [REALTIME_INPUT]: realtimeAudioInputMeta(),
    [REALTIME_AGENT]: meta({
      node_type: REALTIME_AGENT,
      title: "Realtime Agent",
      body: "content_card",
      properties: [prop("audio", "audio"), prop("model", "language_model")],
      outputs: [out("text", "str"), out("audio", "audio", true), out("chunk", "chunk", true)],
      inline_fields: [],
      input_fields: ["audio"],
      is_streaming_output: true,
    }),
    [PREVIEW_NODE_TYPE]: previewMeta("Response"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
