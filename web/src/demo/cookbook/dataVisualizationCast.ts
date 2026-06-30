/**
 * Cookbook Pattern 10 — Data Processing Pipeline (Data Visualization).
 *
 *   Get Request → Import CSV → Filter ─┬→ Filtered Data (Preview)
 *                                      └→ Chart Generator → Chart (Preview)
 *
 * Fetch CSV from the web, parse and filter it into a dataframe, then branch into
 * a table preview and an AI-generated chart. Fully synthetic — the fetched CSV,
 * dataframe, and chart image are canned, so it replays with no network.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { svgImage } from "../assets/sampleMedia";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  previewMeta,
  simpleMeta,
} from "./builders";

const GET_REQUEST = "lib.http.GetText";
const IMPORT_CSV = "nodetool.data.ImportCSV";
const FILTER = "nodetool.data.Filter";
const CHART = "nodetool.generators.ChartGenerator";

const WF = "wf-cookbook-data-visualization";
const JOB = "cookbook-data-visualization-job";
const m = castMessages(WF, JOB);

const CSV_TEXT =
  "month,sales\nJan,120\nFeb,180\nMar,150\nApr,220\nMay,260";
const dataframe = {
  type: "dataframe",
  columns: [
    { name: "month", data_type: "string" },
    { name: "sales", data_type: "int" },
  ],
  data: [
    ["Jan", 120],
    ["Feb", 180],
    ["Mar", 150],
    ["Apr", 220],
    ["May", 260],
  ],
};

const CHART_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
  '<rect width="320" height="200" fill="#0f0f17"/>' +
  '<rect x="30" y="120" width="40" height="60" fill="#7c3aed"/>' +
  '<rect x="86" y="80" width="40" height="100" fill="#8b5cf6"/>' +
  '<rect x="142" y="100" width="40" height="80" fill="#a78bfa"/>' +
  '<rect x="198" y="50" width="40" height="130" fill="#f59e0b"/>' +
  '<rect x="254" y="28" width="40" height="152" fill="#fbbf24"/>' +
  '<line x1="20" y1="180" x2="310" y2="180" stroke="#475569" stroke-width="2"/>' +
  '<text x="160" y="18" fill="#f8fafc" font-family="Inter,sans-serif" font-size="14" text-anchor="middle">Monthly Sales</text>' +
  "</svg>";
const chartImage = { type: "image", uri: svgImage(CHART_SVG) };
const chartConfig = { type: "chart_config", chart_type: "bar", x: "month", y: "sales" };

const nodes = [
  node("get", GET_REQUEST, 0, 170, 280, "Get Request", { url: "https://example.com/sales.csv" }),
  node("csv", IMPORT_CSV, 360, 170, 280, "Import CSV", {}),
  node("filter", FILTER, 720, 170, 280, "Filter", { condition: "sales > 100" }),
  node("table", PREVIEW_NODE_TYPE, 1080, 40, 300, "Filtered Data", {}),
  node("chart", CHART, 1080, 320, 300, "Chart Generator", { prompt: "Bar chart of sales by month" }),
  node("chartView", PREVIEW_NODE_TYPE, 1460, 320, 320, "Chart", {}),
];
const edges = [
  edge("e1", "get", "output", "csv", "csv_data"),
  edge("e2", "csv", "output", "filter", "dataframe"),
  edge("e3", "filter", "output", "table", "value"),
  edge("e4", "filter", "output", "chart", "data"),
  edge("e5", "chart", "output", "chartView", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "get", "Get Request", GET_REQUEST, "running"),
  ...m.progress("get", 6, 600, 900),
  m.nodeUpdate(1600, "get", "Get Request", GET_REQUEST, "completed", { output: CSV_TEXT }),
  m.edgeUpdate(1800, "e1", "active"),

  m.nodeUpdate(2400, "csv", "Import CSV", IMPORT_CSV, "running"),
  m.nodeUpdate(3200, "csv", "Import CSV", IMPORT_CSV, "completed", { output: dataframe }),
  m.edgeUpdate(3300, "e1", "completed"),
  m.edgeUpdate(3500, "e2", "active"),

  m.nodeUpdate(4100, "filter", "Filter", FILTER, "running"),
  m.nodeUpdate(4900, "filter", "Filter", FILTER, "completed", { output: dataframe }),
  m.edgeUpdate(5000, "e2", "completed"),
  m.edgeUpdate(5200, "e3", "active"),
  m.edgeUpdate(5300, "e4", "active"),

  m.nodeUpdate(5900, "table", "Filtered Data", PREVIEW_NODE_TYPE, "running"),
  m.output(6300, "table", "Filtered Data", "value", dataframe, "dataframe"),
  m.nodeUpdate(6700, "table", "Filtered Data", PREVIEW_NODE_TYPE, "completed", { value: dataframe }),
  m.edgeUpdate(6900, "e3", "completed"),

  m.nodeUpdate(7000, "chart", "Chart Generator", CHART, "running"),
  ...m.progress("chart", 10, 7400, 3400),
  m.nodeUpdate(11100, "chart", "Chart Generator", CHART, "completed", { output: chartConfig }),
  m.edgeUpdate(11300, "e4", "completed"),
  m.edgeUpdate(11500, "e5", "active"),

  m.nodeUpdate(12100, "chartView", "Chart", PREVIEW_NODE_TYPE, "running"),
  m.output(12500, "chartView", "Chart", "value", chartImage, "image"),
  m.nodeUpdate(12900, "chartView", "Chart", PREVIEW_NODE_TYPE, "completed", { value: chartImage }),
  m.edgeUpdate(13100, "e5", "completed"),
  m.jobUpdate(13400, "completed", { outputs: { chart: chartImage } }),
];

export const dataVisualizationCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-data-visualization",
  name: "Data Visualization",
  description: "Fetch CSV, filter it into a dataframe, and render an AI-generated chart.",
  createdAt: new Date(0).toISOString(),
  durationMs: 15500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Data Visualization",
    "Get Request → Import CSV → Filter → Preview + Chart Generator.",
    nodes,
    edges
  ),
  metadata: {
    [GET_REQUEST]: simpleMeta(GET_REQUEST, "Get Request", "str", {
      inline: ["url"],
      properties: [prop("url", "str")],
    }),
    [IMPORT_CSV]: simpleMeta(IMPORT_CSV, "Import CSV", "dataframe", {
      inputs: ["csv_data"],
      properties: [prop("csv_data", "str")],
    }),
    [FILTER]: simpleMeta(FILTER, "Filter", "dataframe", {
      inputs: ["dataframe"],
      inline: ["condition"],
      properties: [prop("dataframe", "dataframe"), prop("condition", "str")],
    }),
    [CHART]: simpleMeta(CHART, "Chart Generator", "chart_config", {
      inputs: ["data"],
      inline: ["prompt"],
      properties: [prop("data", "dataframe"), prop("prompt", "str")],
    }),
    [PREVIEW_NODE_TYPE]: previewMeta("Preview"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
