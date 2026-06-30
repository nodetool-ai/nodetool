/**
 * Cookbook Pattern 6 — Email & Web Integration (Summarize Newsletters).
 *
 *   Gmail Search → Email Fields ─┬→ Summarizer → Summary
 *                                └→ Email Body
 *
 * Pull newsletters from Gmail, format their fields, and stream a summary while
 * also previewing the raw body. Fully synthetic — the search returns a canned
 * message and the Summarizer streams a fixed summary, so it replays with no
 * Gmail account.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  previewMeta,
  simpleMeta,
  textAgentMeta,
} from "./builders";

const GMAIL_SEARCH = "lib.mail.GmailSearch";
const TEMPLATE = "nodetool.text.Template";
const SUMMARIZER = "nodetool.agents.Summarizer";

const WF = "wf-cookbook-summarize-newsletters";
const JOB = "cookbook-summarize-newsletters-job";
const m = castMessages(WF, JOB);

const BODY =
  "This week in AI: open models keep closing the gap with frontier labs, a new " +
  "wave of agent frameworks ships, and on-device inference gets cheaper. Plus: " +
  "three workflows to try this weekend.";
const SUMMARY_TOKENS = [
  "Open models are catching up, ",
  "agent frameworks are multiplying, ",
  "and on-device inference is getting cheaper — ",
  "with three weekend workflows to try.",
];
const SUMMARY = SUMMARY_TOKENS.join("");
const MESSAGES = [{ subject: "The AI Weekly", from: "news@aiweekly.dev", body: BODY }];

const nodes = [
  node("gmail", GMAIL_SEARCH, 0, 170, 280, "Gmail Search", { query: "label:newsletters newer_than:7d" }),
  node("fields", TEMPLATE, 400, 170, 300, "Email Fields", { template: "{{ subject }}\n\n{{ body }}" }),
  node("summarizer", SUMMARIZER, 800, 40, 320, "Summarizer", { text: "" }),
  node("summary", PREVIEW_NODE_TYPE, 1200, 40, 300, "Summary", {}),
  node("body", PREVIEW_NODE_TYPE, 800, 380, 300, "Email Body", {}),
];
const edges = [
  edge("e1", "gmail", "output", "fields", "messages"),
  edge("e2", "fields", "output", "summarizer", "text"),
  edge("e3", "summarizer", "text", "summary", "value"),
  edge("e4", "fields", "output", "body", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "gmail", "Gmail Search", GMAIL_SEARCH, "running"),
  ...m.progress("gmail", 6, 600, 1000),
  m.nodeUpdate(1700, "gmail", "Gmail Search", GMAIL_SEARCH, "completed", { output: MESSAGES }),
  m.edgeUpdate(1900, "e1", "active"),

  m.nodeUpdate(2400, "fields", "Email Fields", TEMPLATE, "running"),
  m.nodeUpdate(3200, "fields", "Email Fields", TEMPLATE, "completed", { output: `The AI Weekly\n\n${BODY}` }),
  m.edgeUpdate(3300, "e1", "completed"),
  m.edgeUpdate(3500, "e2", "active"),
  m.edgeUpdate(3600, "e4", "active"),

  m.nodeUpdate(4200, "summarizer", "Summarizer", SUMMARIZER, "running"),
  m.nodeUpdate(4300, "body", "Email Body", PREVIEW_NODE_TYPE, "running"),
  m.output(4700, "body", "Email Body", "value", `The AI Weekly\n\n${BODY}`, "str"),
  m.nodeUpdate(5100, "body", "Email Body", PREVIEW_NODE_TYPE, "completed", { value: `The AI Weekly\n\n${BODY}` }),
  m.edgeUpdate(5300, "e4", "completed"),
  ...m.stream("summarizer", SUMMARY_TOKENS, 5500, 5400),
  m.nodeUpdate(11200, "summarizer", "Summarizer", SUMMARIZER, "completed", { text: SUMMARY }),
  m.edgeUpdate(11400, "e2", "completed"),
  m.edgeUpdate(11600, "e3", "active"),

  m.nodeUpdate(12200, "summary", "Summary", PREVIEW_NODE_TYPE, "running"),
  m.output(12600, "summary", "Summary", "value", SUMMARY, "str"),
  m.nodeUpdate(13000, "summary", "Summary", PREVIEW_NODE_TYPE, "completed", { value: SUMMARY }),
  m.edgeUpdate(13200, "e3", "completed"),
  m.jobUpdate(13500, "completed", { outputs: { value: SUMMARY } }),
];

export const summarizeNewslettersCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-summarize-newsletters",
  name: "Summarize Newsletters",
  description: "Search Gmail, format the email, and stream a summary of the body.",
  createdAt: new Date(0).toISOString(),
  durationMs: 15500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Summarize Newsletters",
    "Gmail Search → Template → Summarizer → Preview.",
    nodes,
    edges
  ),
  metadata: {
    [GMAIL_SEARCH]: simpleMeta(GMAIL_SEARCH, "Gmail Search", "list", {
      inline: ["query"],
      properties: [prop("query", "str")],
    }),
    [TEMPLATE]: simpleMeta(TEMPLATE, "Template", "str", {
      inputs: ["messages"],
      inline: ["template"],
      properties: [prop("template", "str"), prop("messages", "list")],
    }),
    [SUMMARIZER]: textAgentMeta(
      SUMMARIZER,
      "Summarizer",
      [prop("text", "str"), prop("model", "language_model")],
      ["text"]
    ),
    [PREVIEW_NODE_TYPE]: previewMeta("Summary"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
