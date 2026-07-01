/**
 * Workflow gallery — Categorize Mails.
 *
 *   Gmail Search ─┬→ Template → Classifier → Add Label
 *                 └────────────────────────↑
 *
 * Fetch recent mail, format each message into a prompt, classify it, and apply
 * the matching Gmail label. Fully synthetic — the search returns a canned
 * message and the classifier returns a fixed category, so it replays with no
 * Gmail account.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  simpleMeta,
} from "../cookbook/builders";

const GMAIL_SEARCH = "lib.mail.GmailSearch";
const TEMPLATE = "nodetool.text.Template";
const CLASSIFIER = "nodetool.agents.Classifier";
const ADD_LABEL = "lib.mail.AddLabel";

const WF = "wf-workflow-categorize-mails";
const JOB = "workflow-categorize-mails-job";
const m = castMessages(WF, JOB);

const MESSAGE = {
  id: "msg-1",
  subject: "Your weekly product digest",
  from: "news@producthunt.dev",
  body: "The top launches this week, hand-picked for you.",
};
const MESSAGES = [MESSAGE];
const PROMPT =
  "Subject: Your weekly product digest\nFrom: news@producthunt.dev\n\nThe top launches this week, hand-picked for you.";
const CATEGORY = "Newsletter";

const nodes = [
  node("gmail", GMAIL_SEARCH, 0, 170, 280, "Gmail Search", { query: "newer_than:2d" }),
  node("template", TEMPLATE, 380, 20, 300, "Format Email", {
    template: "Subject: {{ subject }}\nFrom: {{ from }}\n\n{{ body }}",
  }),
  node("classifier", CLASSIFIER, 780, 20, 300, "Classifier", {}),
  node("addlabel", ADD_LABEL, 1160, 170, 280, "Add Label", {}),
];
const edges = [
  edge("e1", "gmail", "output", "template", "messages"),
  edge("e2", "template", "output", "classifier", "text"),
  edge("e3", "classifier", "output", "addlabel", "label"),
  edge("e4", "gmail", "output", "addlabel", "message_id"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "gmail", "Gmail Search", GMAIL_SEARCH, "running"),
  ...m.progress("gmail", 6, 600, 1000),
  m.nodeUpdate(1800, "gmail", "Gmail Search", GMAIL_SEARCH, "completed", { output: MESSAGES }),
  m.edgeUpdate(2000, "e1", "active"),
  m.edgeUpdate(2100, "e4", "active"),

  m.nodeUpdate(2700, "template", "Format Email", TEMPLATE, "running"),
  m.nodeUpdate(3500, "template", "Format Email", TEMPLATE, "completed", { output: PROMPT }),
  m.edgeUpdate(3700, "e1", "completed"),
  m.edgeUpdate(3900, "e2", "active"),

  m.nodeUpdate(4500, "classifier", "Classifier", CLASSIFIER, "running"),
  ...m.progress("classifier", 5, 4900, 2600),
  m.nodeUpdate(7900, "classifier", "Classifier", CLASSIFIER, "completed", {
    output: CATEGORY,
    category: CATEGORY,
  }),
  m.edgeUpdate(8100, "e2", "completed"),
  m.edgeUpdate(8300, "e3", "active"),

  m.nodeUpdate(8900, "addlabel", "Add Label", ADD_LABEL, "running"),
  m.edgeUpdate(9300, "e4", "completed"),
  m.nodeUpdate(9700, "addlabel", "Add Label", ADD_LABEL, "completed", { output: CATEGORY }),
  m.edgeUpdate(9900, "e3", "completed"),
  m.jobUpdate(10200, "completed", { outputs: { label: CATEGORY } }),
];

export const categorizeMailsCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-categorize-mails",
  name: "Categorize Mails",
  description: "Classify incoming mail with an LLM and apply the matching Gmail label.",
  createdAt: new Date(0).toISOString(),
  durationMs: 10500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Categorize Mails",
    "Gmail Search → Template → Classifier → Add Label.",
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
    [CLASSIFIER]: simpleMeta(CLASSIFIER, "Classifier", "str", {
      inputs: ["text"],
      properties: [prop("text", "str"), prop("model", "language_model")],
    }),
    [ADD_LABEL]: simpleMeta(ADD_LABEL, "Add Label", "str", {
      inputs: ["message_id", "label"],
      inline: ["label"],
      properties: [prop("message_id", "str"), prop("label", "str")],
    }),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
