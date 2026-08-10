/**
 * Cookbook Pattern 5 — Database Persistence (AI Flashcards with SQLite).
 *
 *   Topic → Prompt → Data Generator → Store & Read (Code) → Flashcards (Preview)
 *
 * The persistence pattern: a Data Generator streams structured records, then one
 * Code node importing `@nodetool-ai/sandbox-sqlite` inserts them and reads the
 * deck back for display. Fully synthetic — the generated flashcards and the
 * queried dataframe are canned, so it replays with no database.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import {
  cookbookWorkflow,
  dataGeneratorMeta,
  edge,
  fitViewport,
  node,
  previewMeta,
  simpleMeta,
  stringInputMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const TEMPLATE = "nodetool.text.Template";
const DATA_GENERATOR = "nodetool.generators.DataGenerator";
const CODE = "nodetool.code.Code";

const WF = "wf-cookbook-flashcards-sqlite";
const JOB = "cookbook-flashcards-sqlite-job";
const m = castMessages(WF, JOB);

const TOPIC = "Spanish verbs";
const CARDS = [
  { front: "hablar", back: "to speak" },
  { front: "comer", back: "to eat" },
  { front: "vivir", back: "to live" },
  { front: "tener", back: "to have" },
];
const dataframe = {
  type: "dataframe",
  columns: [
    { name: "front", data_type: "string" },
    { name: "back", data_type: "string" },
  ],
  data: CARDS.map((c) => [c.front, c.back]),
};

const STORE_CODE = `import { run } from "@nodetool-ai/sandbox-sqlite";

const { database, results } = await run(await workspace.readBytes("cards.db"), [
  { sql: "CREATE TABLE IF NOT EXISTS flashcards (front TEXT, back TEXT)" },
  ...inputs.cards.rows.map((c) => ({
    sql: "INSERT INTO flashcards (front, back) VALUES (?, ?)",
    params: [c.front, c.back],
  })),
  { sql: "SELECT * FROM flashcards" },
]);
await workspace.writeBytes("cards.db", database);
return { deck: results.at(-1).rows };`;

const nodes = [
  node("topic", STRING_INPUT, 0, 40, 240, "Topic", { name: "topic", value: TOPIC }),
  node("format", TEMPLATE, 360, 40, 280, "Prompt", {
    template: "Make 4 flashcards for {{ topic }}.",
  }),
  node("generate", DATA_GENERATOR, 720, 40, 300, "Generate Flashcards", { prompt: "" }),
  node("store", CODE, 1100, 40, 320, "Store & Read", { code: STORE_CODE }),
  node("preview", PREVIEW_NODE_TYPE, 1100, 340, 320, "Flashcards", {}),
];
const edges = [
  edge("e1", "topic", "output", "format", "topic"),
  edge("e2", "format", "output", "generate", "prompt"),
  edge("e3", "generate", "dataframe", "store", "cards"),
  edge("e4", "store", "deck", "preview", "value"),
];

const streamRecords = (start: number, span: number): CastEvent[] =>
  CARDS.flatMap((card, i) => {
    const t = Math.round(start + (span * i) / CARDS.length);
    return [
      m.output(t, "generate", "Generate Flashcards", "record", card, "dict"),
      m.output(t + 20, "generate", "Generate Flashcards", "index", i, "int"),
    ];
  });

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "topic", "Topic", STRING_INPUT, "running"),
  m.nodeUpdate(1300, "topic", "Topic", STRING_INPUT, "completed", { output: TOPIC }),
  m.edgeUpdate(1600, "e1", "active"),

  m.nodeUpdate(2400, "format", "Prompt", TEMPLATE, "running"),
  m.nodeUpdate(3200, "format", "Prompt", TEMPLATE, "completed", {
    output: "Make 4 flashcards for Spanish verbs.",
  }),
  m.edgeUpdate(3300, "e1", "completed"),
  m.edgeUpdate(3500, "e2", "active"),

  m.nodeUpdate(4100, "generate", "Generate Flashcards", DATA_GENERATOR, "running"),
  ...streamRecords(4500, 4000),
  m.nodeUpdate(8800, "generate", "Generate Flashcards", DATA_GENERATOR, "completed", { dataframe }),
  m.edgeUpdate(9000, "e2", "completed"),
  m.edgeUpdate(9200, "e3", "active"),

  m.nodeUpdate(9800, "store", "Store & Read", CODE, "running"),
  m.nodeUpdate(12200, "store", "Store & Read", CODE, "completed", { deck: dataframe }),
  m.edgeUpdate(12400, "e3", "completed"),
  m.edgeUpdate(12600, "e4", "active"),

  m.nodeUpdate(13000, "preview", "Flashcards", PREVIEW_NODE_TYPE, "running"),
  m.output(13400, "preview", "Flashcards", "value", dataframe, "dataframe"),
  m.nodeUpdate(13800, "preview", "Flashcards", PREVIEW_NODE_TYPE, "completed", { value: dataframe }),
  m.edgeUpdate(14000, "e4", "completed"),
  m.jobUpdate(14300, "completed", { outputs: { value: dataframe } }),
];

export const flashcardsSqliteCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-flashcards-sqlite",
  name: "AI Flashcards with SQLite",
  description: "Generate structured records, persist them in SQLite, and read them back.",
  createdAt: new Date(0).toISOString(),
  durationMs: 16000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "AI Flashcards with SQLite",
    "Topic → Data Generator → one Code node that inserts and queries → Preview.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [TEMPLATE]: simpleMeta(TEMPLATE, "Template", "str", {
      inputs: ["topic"],
      inline: ["template"],
      properties: [prop("template", "str"), prop("topic", "str")],
    }),
    [DATA_GENERATOR]: dataGeneratorMeta(),
    [CODE]: simpleMeta(CODE, "Code", "dataframe", {
      inputs: ["cards"],
      inline: ["code"],
      properties: [prop("code", "str"), prop("cards", "dataframe")],
    }),
    [PREVIEW_NODE_TYPE]: previewMeta("Flashcards"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
