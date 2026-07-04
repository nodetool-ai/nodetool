/**
 * Cookbook Pattern 4 — RAG (Chat with Docs).
 *
 *   Question ─┬─────────────→ Format Prompt → Agent → Answer
 *             └→ Hybrid Search ─↑
 *
 * The retrieval-augmented pattern: a question both runs a hybrid vector search
 * and feeds a prompt template; the retrieved passages are injected as context,
 * and the Agent streams a grounded answer. Fully synthetic — the search returns
 * canned passages and the Agent streams a fixed answer, so it replays with no
 * vector store or backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import {
  OUTPUT_NODE_TYPE,
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  outputMeta,
  simpleMeta,
  stringInputMeta,
  textAgentMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const HYBRID_SEARCH = "vector.HybridSearch";
const TEMPLATE = "nodetool.text.Template";
const AGENT = "nodetool.agents.Agent";

const WF = "wf-cookbook-chat-with-docs";
const JOB = "cookbook-chat-with-docs-job";
const m = castMessages(WF, JOB);

const QUESTION = "How do I deploy a NodeTool server?";
const PASSAGES = [
  "Deploy with Docker: `nodetool serve --host 0.0.0.0`.",
  "RunPod, GCP, and Supabase targets are configured in deployment.yaml.",
];
const ANSWER_TOKENS = [
  "Run the server with ",
  "`nodetool serve`, ",
  "or deploy it with Docker ",
  "to RunPod, GCP, or Supabase ",
  "using a deployment.yaml — ",
  "set your environment variables ",
  "and the API listens on port 7777.",
];
const ANSWER = ANSWER_TOKENS.join("");

const nodes = [
  node("question", STRING_INPUT, 0, 180, 260, "Question", { name: "question", value: QUESTION }),
  node("search", HYBRID_SEARCH, 360, 360, 280, "Hybrid Search", { text: QUESTION }),
  node("format", TEMPLATE, 740, 180, 300, "Format Prompt", {
    template: "Context:\n{{ context }}\n\nQuestion: {{ question }}",
  }),
  node("answer", AGENT, 1140, 180, 320, "Answer", { prompt: "" }),
  node("output", OUTPUT_NODE_TYPE, 1560, 180, 280, "Answer", { name: "answer" }),
];
const edges = [
  edge("e1", "question", "output", "format", "question"),
  edge("e2", "question", "output", "search", "text"),
  edge("e3", "search", "output", "format", "context"),
  edge("e4", "format", "output", "answer", "prompt"),
  edge("e5", "answer", "text", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "question", "Question", STRING_INPUT, "running"),
  m.nodeUpdate(1300, "question", "Question", STRING_INPUT, "completed", { output: QUESTION }),
  m.edgeUpdate(1600, "e1", "active"),
  m.edgeUpdate(1700, "e2", "active"),

  m.nodeUpdate(2300, "search", "Hybrid Search", HYBRID_SEARCH, "running"),
  ...m.progress("search", 8, 2600, 1400),
  m.nodeUpdate(4300, "search", "Hybrid Search", HYBRID_SEARCH, "completed", { output: PASSAGES }),
  m.edgeUpdate(4500, "e2", "completed"),
  m.edgeUpdate(4700, "e3", "active"),

  m.nodeUpdate(5300, "format", "Format Prompt", TEMPLATE, "running"),
  m.nodeUpdate(6200, "format", "Format Prompt", TEMPLATE, "completed", {
    output: `Context:\n${PASSAGES.join("\n")}\n\nQuestion: ${QUESTION}`,
  }),
  m.edgeUpdate(6400, "e1", "completed"),
  m.edgeUpdate(6500, "e3", "completed"),
  m.edgeUpdate(6700, "e4", "active"),

  m.nodeUpdate(7300, "answer", "Answer", AGENT, "running"),
  ...m.stream("answer", ANSWER_TOKENS, 7800, 5600),
  m.nodeUpdate(13800, "answer", "Answer", AGENT, "completed", { text: ANSWER }),
  m.edgeUpdate(14000, "e4", "completed"),
  m.edgeUpdate(14200, "e5", "active"),

  m.nodeUpdate(14800, "output", "Answer", OUTPUT_NODE_TYPE, "running"),
  m.output(15200, "output", "Answer", "value", ANSWER, "str"),
  m.nodeUpdate(15600, "output", "Answer", OUTPUT_NODE_TYPE, "completed", { value: ANSWER }),
  m.edgeUpdate(15800, "e5", "completed"),
  m.jobUpdate(16100, "completed", { outputs: { answer: ANSWER } }),
];

export const chatWithDocsCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-chat-with-docs",
  name: "Chat with Docs",
  description: "Retrieve passages with hybrid search, then stream a grounded answer.",
  createdAt: new Date(0).toISOString(),
  durationMs: 18500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Chat with Docs",
    "Question → Hybrid Search + Template → Agent → Answer.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [HYBRID_SEARCH]: simpleMeta(HYBRID_SEARCH, "Hybrid Search", "list", {
      inputs: ["text", "collection"],
      inline: [],
      properties: [prop("text", "str"), prop("collection", "collection")],
    }),
    [TEMPLATE]: simpleMeta(TEMPLATE, "Template", "str", {
      inputs: ["question", "context"],
      inline: ["template"],
      properties: [prop("template", "str"), prop("question", "str"), prop("context", "str")],
    }),
    [AGENT]: textAgentMeta(AGENT, "Agent"),
    [OUTPUT_NODE_TYPE]: outputMeta("Answer"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
