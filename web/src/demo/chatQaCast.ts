/**
 * "Ask the AI" tutorial cast.
 *
 * A single question flows into the real `nodetool.agents.Agent`, which streams
 * its answer. The Agent renders with its `body: "content_card"` text card: the
 * answer streams in live (ChunkDisplay) and settles into the card, then lands
 * in a Preview — the simplest chat-style Q&A. Fully synthetic (real metadata,
 * streamed text, no backend), so it replays with no recording.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.StringInput";
const CHAT_TYPE = "nodetool.agents.Agent";

const WF = "wf-chat-qa";
const JOB = "chat-qa-job";
const m = castMessages(WF, JOB);

const QUESTION = "Explain what an API is, in one sentence.";
const ANSWER_TOKENS = [
  "An API is a ",
  "set of rules ",
  "that lets one program ",
  "request data or actions ",
  "from another, ",
  "without needing to know ",
  "how it works inside.",
];
const ANSWER = ANSWER_TOKENS.join("");

const workflow = {
  id: WF,
  name: "Ask the AI",
  access: "private",
  description: "Question → Agent (LLM) → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("question", INPUT_TYPE, 0, 150, 260, "Question", { name: "question", value: QUESTION }),
      node("chat", CHAT_TYPE, 400, 150, 320, "Agent", { prompt: QUESTION }),
      node("preview", PREVIEW_NODE_TYPE, 840, 150, 340, "Preview", {}),
    ],
    edges: [
      edge("e1", "question", "output", "chat", "prompt"),
      edge("e2", "chat", "text", "preview", "value"),
    ],
  },
} as unknown as Workflow;

// Paced so the question reads, then the answer streams word-group by word-group.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) A question feeds the model.
  m.nodeUpdate(300, "question", "Question", INPUT_TYPE, "running"),
  m.nodeUpdate(1500, "question", "Question", INPUT_TYPE, "completed", { output: QUESTION }),
  m.edgeUpdate(1800, "e1", "active"),

  // 2) The Agent streams its answer into the text content card.
  m.nodeUpdate(2500, "chat", "Agent", CHAT_TYPE, "running"),
  ...m.stream("chat", ANSWER_TOKENS, 3000, 6000),
  m.nodeUpdate(9600, "chat", "Agent", CHAT_TYPE, "completed", { text: ANSWER }),
  m.edgeUpdate(9800, "e1", "completed"),
  m.edgeUpdate(10000, "e2", "active"),

  // 3) Preview shows the finished answer.
  m.nodeUpdate(10700, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(11300, "preview", "Preview", "value", ANSWER, "str"),
  m.nodeUpdate(11900, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: ANSWER }),
  m.edgeUpdate(12200, "e2", "completed"),
  m.jobUpdate(12500, "completed", { outputs: { value: ANSWER } }),
];

export const chatQaCast: DemoCast = {
  version: CAST_VERSION,
  id: "ask-ai",
  name: "Ask the AI",
  description: "Ask a question and get a streamed answer from a single LLM node.",
  createdAt: new Date(0).toISOString(),
  durationMs: 14500,
  fps: 30,
  workflow,
  metadata: {
    [INPUT_TYPE]: meta({
      node_type: INPUT_TYPE,
      title: "String Input",
      properties: [prop("name", "str"), prop("value", "str")],
      outputs: [out("output", "str")],
      inline_fields: ["value"],
      input_fields: [],
    }),
    [CHAT_TYPE]: meta({
      node_type: CHAT_TYPE,
      title: "Agent",
      body: "content_card",
      auto_save_asset: true,
      properties: [
        prop("prompt", "str"),
        prop("model", "language_model"),
        prop("system", "str"),
      ],
      outputs: [out("text", "str"), out("chunk", "chunk", true)],
      inline_fields: [],
      input_fields: ["prompt"],
      is_streaming_output: true,
    }),
    [PREVIEW_NODE_TYPE]: meta({
      node_type: PREVIEW_NODE_TYPE,
      title: "Preview",
      properties: [prop("value", "any")],
      outputs: [out("output", "any")],
    }),
  },
  events,
  assets: [],
  // Frames the three-node row (graph bbox ~x[0,1180] y[150,440]) in 1920×1080.
  viewport: { x: 360, y: 290, zoom: 0.92 },
};
