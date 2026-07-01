/**
 * Workflow gallery — Data Generator.
 *
 *   Data Generator → Preview (dataframe)
 *
 * An LLM streams structured records straight into a table. Fully synthetic — the
 * generated rows are canned, so it replays with no backend.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages } from "../castHelpers";
import {
  cookbookWorkflow,
  dataGeneratorMeta,
  edge,
  fitViewport,
  node,
  previewMeta,
} from "../cookbook/builders";

const DATA_GENERATOR = "nodetool.generators.DataGenerator";

const WF = "wf-workflow-data-generator";
const JOB = "workflow-data-generator-job";
const m = castMessages(WF, JOB);

const ROWS = [
  { name: "Ada Lovelace", field: "Mathematics", year: 1843 },
  { name: "Alan Turing", field: "Computing", year: 1936 },
  { name: "Grace Hopper", field: "Compilers", year: 1952 },
  { name: "Katherine Johnson", field: "Orbital mechanics", year: 1961 },
];
const dataframe = {
  type: "dataframe",
  columns: [
    { name: "name", data_type: "string" },
    { name: "field", data_type: "string" },
    { name: "year", data_type: "int" },
  ],
  data: ROWS.map((r) => [r.name, r.field, r.year]),
};

const nodes = [
  node("generate", DATA_GENERATOR, 0, 60, 340, "Generate Dataset", {
    prompt: "Five pioneers of computing with field and year.",
  }),
  node("preview", PREVIEW_NODE_TYPE, 460, 60, 360, "Dataset", {}),
];
const edges = [edge("e1", "generate", "dataframe", "preview", "value")];

const streamRecords = (start: number, span: number): CastEvent[] =>
  ROWS.flatMap((row, i) => {
    const t = Math.round(start + (span * i) / ROWS.length);
    return [
      m.output(t, "generate", "Generate Dataset", "record", row, "dict"),
      m.output(t + 20, "generate", "Generate Dataset", "index", i, "int"),
    ];
  });

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(400, "generate", "Generate Dataset", DATA_GENERATOR, "running"),
  ...streamRecords(1200, 5200),
  m.nodeUpdate(7000, "generate", "Generate Dataset", DATA_GENERATOR, "completed", { dataframe }),
  m.edgeUpdate(7300, "e1", "active"),

  m.nodeUpdate(7900, "preview", "Dataset", PREVIEW_NODE_TYPE, "running"),
  m.output(8300, "preview", "Dataset", "value", dataframe, "dataframe"),
  m.nodeUpdate(8700, "preview", "Dataset", PREVIEW_NODE_TYPE, "completed", { value: dataframe }),
  m.edgeUpdate(8900, "e1", "completed"),
  m.jobUpdate(9200, "completed", { outputs: { value: dataframe } }),
];

export const dataGeneratorCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-data-generator",
  name: "Data Generator",
  description: "Generate a structured dataset with an AI agent and preview it as a table.",
  createdAt: new Date(0).toISOString(),
  durationMs: 10500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Data Generator",
    "Data Generator → Preview.",
    nodes,
    edges
  ),
  metadata: {
    [DATA_GENERATOR]: dataGeneratorMeta(),
    [PREVIEW_NODE_TYPE]: previewMeta("Dataset"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
