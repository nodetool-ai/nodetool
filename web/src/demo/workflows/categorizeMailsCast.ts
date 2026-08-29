/**
 * Workflow gallery — Categorize Mails.
 *
 *   Gmail Search ─┬→ Template → Classifier → Add Label
 *                 └────────────────────────↑
 *
 * Fetch recent mail, format each message into a prompt, classify it, and apply
 * the matching Gmail label. Search and labelling are Code nodes calling the
 * `google` capability module. Fully synthetic — the search returns a canned
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

const CODE = "nodetool.code.Code";
const TEMPLATE = "nodetool.text.Template";
const CLASSIFIER = "nodetool.agents.Classifier";

const SEARCH_CODE = `import { gmail_search } from "@nodetool-ai/sandbox-nodetool/google";

const { messages } = await gmail_search({ query: inputs.query, max_results: 20 });
await output("messages", messages);`;

const LABEL_CODE = `import { gmail_modify_labels } from "@nodetool-ai/sandbox-nodetool/google";

await gmail_modify_labels({
  message_id: inputs.message_id,
  add_label_ids: [inputs.label]
});
await output("label", inputs.label);`;

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
  node("gmail", CODE, 0, 170, 280, "Gmail Search", { code: SEARCH_CODE }),
  node("template", TEMPLATE, 380, 20, 300, "Format Email", {
    template: "Subject: {{ subject }}\nFrom: {{ from }}\n\n{{ body }}",
  }),
  node("classifier", CLASSIFIER, 780, 20, 300, "Classifier", {}),
  node("addlabel", CODE, 1160, 170, 280, "Add Label", { code: LABEL_CODE }),
];
const edges = [
  edge("e1", "gmail", "output", "template", "messages"),
  edge("e2", "template", "output", "classifier", "text"),
  edge("e3", "classifier", "output", "addlabel", "label"),
  edge("e4", "gmail", "output", "addlabel", "message_id"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "gmail", "Gmail Search", CODE, "running"),
  ...m.progress("gmail", 6, 600, 1000),
  m.nodeUpdate(1800, "gmail", "Gmail Search", CODE, "completed", { output: MESSAGES }),
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

  m.nodeUpdate(8900, "addlabel", "Add Label", CODE, "running"),
  m.edgeUpdate(9300, "e4", "completed"),
  m.nodeUpdate(9700, "addlabel", "Add Label", CODE, "completed", { output: CATEGORY }),
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
    [CODE]: simpleMeta(CODE, "Code", "str", {
      inline: ["code"],
      properties: [prop("code", "str")],
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
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
