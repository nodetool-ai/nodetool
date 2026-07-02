/**
 * Workflow gallery — Fetch Papers.
 *
 *   Get Text → Extract Links → Filter → For Each → Download File → Collect
 *
 * Scrape a README, pull out the paper links, keep the PDFs, and download each
 * one. Fully synthetic — canned markdown, a fixed link table, and streamed
 * downloads stand in for the run, so it replays with no network.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  previewMeta,
  simpleMeta,
} from "../cookbook/builders";
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";

const GET_TEXT = "lib.http.GetText";
const EXTRACT_LINKS = "lib.markdown.ExtractLinks";
const FILTER = "nodetool.data.Filter";
const FOR_EACH = "nodetool.control.ForEach";
const DOWNLOAD = "lib.browser.DownloadFile";
const COLLECT = "nodetool.control.Collect";

const WF = "wf-workflow-fetch-papers";
const JOB = "workflow-fetch-papers-job";
const m = castMessages(WF, JOB);

const README =
  "# Awesome Transformers\n\n- [Attention Is All You Need](attention.pdf)\n" +
  "- [BERT](bert.pdf)\n- [GPT-3](gpt3.pdf)\n- [LLaMA](llama.pdf)\n- [Homepage](index.html)";
const LINKS = {
  type: "dataframe",
  columns: [
    { name: "text", data_type: "string" },
    { name: "href", data_type: "string" },
  ],
  data: [
    ["Attention Is All You Need", "attention.pdf"],
    ["BERT", "bert.pdf"],
    ["GPT-3", "gpt3.pdf"],
    ["LLaMA", "llama.pdf"],
    ["Homepage", "index.html"],
  ],
};
const PAPERS = ["attention.pdf", "bert.pdf", "gpt3.pdf", "llama.pdf"];
const FILTERED = {
  type: "dataframe",
  columns: LINKS.columns,
  data: LINKS.data.filter((r) => String(r[1]).endsWith(".pdf")),
};

const nodes = [
  node("get", GET_TEXT, 0, 170, 280, "Get Text", { url: "https://github.com/.../README.md" }),
  node("links", EXTRACT_LINKS, 360, 170, 300, "Extract Links", {}),
  node("filter", FILTER, 740, 170, 300, "Keep PDFs", { condition: "href.endswith('.pdf')" }),
  node("foreach", FOR_EACH, 1120, 170, 260, "For Each", {}),
  node("download", DOWNLOAD, 1440, 20, 280, "Download File", {}),
  node("collect", COLLECT, 1440, 320, 260, "Collect", {}),
  node("preview", PREVIEW_NODE_TYPE, 1800, 320, 300, "Papers", {}),
];
const edges = [
  edge("e1", "get", "output", "links", "markdown"),
  edge("e2", "links", "output", "filter", "df"),
  edge("e3", "filter", "output", "foreach", "input_list"),
  edge("e4", "foreach", "output", "download", "url"),
  edge("e5", "download", "output", "collect", "input_item"),
  edge("e6", "collect", "output", "preview", "value"),
];

const streamDownloads = (start: number, span: number): CastEvent[] =>
  PAPERS.flatMap((paper, i) => {
    const t = Math.round(start + (span * i) / PAPERS.length);
    return [
      m.output(t, "foreach", "For Each", "output", paper, "str"),
      m.output(t + 40, "download", "Download File", "output", paper, "str"),
    ];
  });

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "get", "Get Text", GET_TEXT, "running"),
  ...m.progress("get", 5, 700, 1400),
  m.nodeUpdate(2400, "get", "Get Text", GET_TEXT, "completed", { output: README }),
  m.edgeUpdate(2600, "e1", "active"),

  m.nodeUpdate(3200, "links", "Extract Links", EXTRACT_LINKS, "running"),
  m.nodeUpdate(4200, "links", "Extract Links", EXTRACT_LINKS, "completed", { output: LINKS }),
  m.edgeUpdate(4400, "e1", "completed"),
  m.edgeUpdate(4600, "e2", "active"),

  m.nodeUpdate(5200, "filter", "Keep PDFs", FILTER, "running"),
  m.nodeUpdate(6200, "filter", "Keep PDFs", FILTER, "completed", { output: FILTERED }),
  m.edgeUpdate(6400, "e2", "completed"),
  m.edgeUpdate(6600, "e3", "active"),

  m.nodeUpdate(7200, "foreach", "For Each", FOR_EACH, "running"),
  m.nodeUpdate(7400, "download", "Download File", DOWNLOAD, "running"),
  m.edgeUpdate(7600, "e4", "active"),
  ...streamDownloads(7800, 4400),
  m.nodeUpdate(12600, "download", "Download File", DOWNLOAD, "completed", { output: "llama.pdf" }),
  m.nodeUpdate(12800, "foreach", "For Each", FOR_EACH, "completed", { output: PAPERS }),
  m.edgeUpdate(13000, "e3", "completed"),
  m.edgeUpdate(13100, "e4", "completed"),
  m.edgeUpdate(13300, "e5", "active"),

  m.nodeUpdate(13700, "collect", "Collect", COLLECT, "running"),
  m.nodeUpdate(14400, "collect", "Collect", COLLECT, "completed", { output: PAPERS }),
  m.edgeUpdate(14600, "e5", "completed"),
  m.edgeUpdate(14800, "e6", "active"),

  m.nodeUpdate(15300, "preview", "Papers", PREVIEW_NODE_TYPE, "running"),
  m.output(15700, "preview", "Papers", "value", PAPERS, "list"),
  m.nodeUpdate(16100, "preview", "Papers", PREVIEW_NODE_TYPE, "completed", { value: PAPERS }),
  m.edgeUpdate(16300, "e6", "completed"),
  m.jobUpdate(16600, "completed", { outputs: { value: PAPERS } }),
];

export const fetchPapersCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-fetch-papers",
  name: "Fetch Papers",
  description: "Scrape a README, filter for PDFs, and download every paper.",
  createdAt: new Date(0).toISOString(),
  durationMs: 17000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Fetch Papers",
    "Get Text → Extract Links → Filter → For Each → Download → Collect.",
    nodes,
    edges
  ),
  metadata: {
    [GET_TEXT]: simpleMeta(GET_TEXT, "Get Text", "str", {
      inline: ["url"],
      properties: [prop("url", "str")],
    }),
    [EXTRACT_LINKS]: simpleMeta(EXTRACT_LINKS, "Extract Links", "dataframe", {
      inputs: ["markdown"],
      properties: [prop("markdown", "str")],
    }),
    [FILTER]: simpleMeta(FILTER, "Filter", "dataframe", {
      inputs: ["df"],
      inline: ["condition"],
      properties: [prop("df", "dataframe"), prop("condition", "str")],
    }),
    [FOR_EACH]: simpleMeta(FOR_EACH, "For Each", "str", {
      inputs: ["input_list"],
      properties: [prop("input_list", "list")],
      streaming: true,
    }),
    [DOWNLOAD]: simpleMeta(DOWNLOAD, "Download File", "str", {
      inputs: ["url"],
      properties: [prop("url", "str")],
    }),
    [COLLECT]: simpleMeta(COLLECT, "Collect", "list", {
      inputs: ["input_item"],
      properties: [prop("input_item", "str")],
    }),
    [PREVIEW_NODE_TYPE]: previewMeta("Papers"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
