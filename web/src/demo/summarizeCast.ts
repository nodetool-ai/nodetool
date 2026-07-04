/**
 * "Summarize a document" tutorial cast.
 *
 * A long passage flows into the real `nodetool.agents.Summarizer`, which streams
 * a short summary — the condense pattern behind the Summarize RSS / Meeting
 * Transcript templates. The Summarizer renders with its
 * `body: "content_card"` text card: the summary streams in live (ChunkDisplay)
 * and settles into the card, then lands in a Preview. Fully synthetic (real
 * metadata, streamed text, no backend), so it replays with no recording.
 */
import { PREVIEW_NODE_TYPE } from "../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages, edge, meta, node, out, prop } from "./castHelpers";
import type { Workflow } from "../stores/ApiTypes";

const INPUT_TYPE = "nodetool.input.StringInput";
const SUMMARIZE_TYPE = "nodetool.agents.Summarizer";

const WF = "wf-summarize-text";
const JOB = "summarize-text-job";
const m = castMessages(WF, JOB);

const ARTICLE =
  "NodeTool is a visual platform for building AI workflows. Instead of writing " +
  "code, you connect nodes on a canvas — inputs, models, and outputs — and run " +
  "them as a graph. Each node does one job and passes its result to the next, " +
  "so you can prototype an idea, watch live output appear on the canvas, and " +
  "reshape the pipeline in minutes rather than days.";

// Stream the summary in believable LLM-sized chunks.
const SUMMARY_TOKENS = [
  "NodeTool lets you build ",
  "AI workflows visually — ",
  "connect nodes on a canvas, ",
  "run them as a graph, ",
  "and watch live results, ",
  "no code required.",
];
const SUMMARY = SUMMARY_TOKENS.join("");

const workflow = {
  id: WF,
  name: "Summarize a Document",
  access: "private",
  description: "Article → Summarizer → Preview.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("source", INPUT_TYPE, 0, 150, 300, "Article", { name: "article", value: ARTICLE }),
      // The Summarizer's `text` is its primary input — fed from upstream here, so
      // its inline field stays empty and the streamed summary fills the card.
      node("summary", SUMMARIZE_TYPE, 460, 150, 320, "Summarizer", { text: "" }),
      node("preview", PREVIEW_NODE_TYPE, 900, 150, 340, "Preview", {}),
    ],
    edges: [
      edge("e1", "source", "output", "summary", "text"),
      edge("e2", "summary", "text", "preview", "value"),
    ],
  },
} as unknown as Workflow;

// Paced so the article reads, then the summary streams phrase by phrase.
const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  // 1) A long passage feeds the summarizer.
  m.nodeUpdate(300, "source", "Article", INPUT_TYPE, "running"),
  m.nodeUpdate(1500, "source", "Article", INPUT_TYPE, "completed", { output: ARTICLE }),
  m.edgeUpdate(1800, "e1", "active"),

  // 2) The Summarizer streams a condensed summary into its text content card.
  m.nodeUpdate(2500, "summary", "Summarizer", SUMMARIZE_TYPE, "running"),
  ...m.stream("summary", SUMMARY_TOKENS, 3000, 6000),
  m.nodeUpdate(9600, "summary", "Summarizer", SUMMARIZE_TYPE, "completed", { text: SUMMARY }),
  m.edgeUpdate(9800, "e1", "completed"),
  m.edgeUpdate(10000, "e2", "active"),

  // 3) Preview shows the finished summary.
  m.nodeUpdate(10700, "preview", "Preview", PREVIEW_NODE_TYPE, "running"),
  m.output(11300, "preview", "Preview", "value", SUMMARY, "str"),
  m.nodeUpdate(11900, "preview", "Preview", PREVIEW_NODE_TYPE, "completed", { value: SUMMARY }),
  m.edgeUpdate(12200, "e2", "completed"),
  m.jobUpdate(12500, "completed", { outputs: { value: SUMMARY } }),
];

export const summarizeCast: DemoCast = {
  version: CAST_VERSION,
  id: "summarize-text",
  name: "Summarize a Document",
  description: "Condense a long passage into key points with a single Summarizer node.",
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
    [SUMMARIZE_TYPE]: meta({
      node_type: SUMMARIZE_TYPE,
      title: "Summarizer",
      body: "content_card",
      auto_save_asset: true,
      properties: [
        prop("text", "str"),
        prop("model", "language_model"),
        prop("system_prompt", "str"),
      ],
      outputs: [out("text", "str"), out("chunk", "chunk", true)],
      inline_fields: ["text"],
      input_fields: ["system_prompt"],
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
  // Frames the three-node row (graph bbox ~x[0,1240] y[150,470]) in 1920×1080.
  viewport: { x: 320, y: 280, zoom: 0.88 },
};
