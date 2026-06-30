/**
 * Cookbook Pattern 3 — Streaming with Multiple Previews (Movie Poster).
 *
 *   Title ┐
 *   Genre ┼→ Strategy Prompt → Strategy (Agent) ─┬→ Strategy Notes (Preview)
 *   Audience ┘                                    └→ Prompt Ideas (List) → Poster
 *
 * A multi-stage generation: three inputs fill a strategy prompt, an Agent streams
 * creative direction (mirrored in a preview), a List Generator streams poster
 * prompt ideas, and a Text To Image node renders the final poster. Fully
 * synthetic — streamed text/items and the kitten image stand in for the run.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import { EXAMPLE_IMAGE_DATA_URI } from "../assets/exampleImage";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  imageNodeMeta,
  listGeneratorMeta,
  node,
  previewMeta,
  simpleMeta,
  stringInputMeta,
  textAgentMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const TEMPLATE = "nodetool.text.Template";
const AGENT = "nodetool.agents.Agent";
const LIST = "nodetool.generators.ListGenerator";
const TEXT_TO_IMAGE = "nodetool.image.TextToImage";

const WF = "wf-cookbook-movie-poster";
const JOB = "cookbook-movie-poster-job";
const m = castMessages(WF, JOB);

const poster = { type: "image", uri: EXAMPLE_IMAGE_DATA_URI };

const STRATEGY_TOKENS = [
  "Lead with a lone hero ",
  "against a neon skyline, ",
  "cold blues cut by a warm key light, ",
  "huge title type, ",
  "a sense of looming danger — ",
  "premium, cinematic, unmistakably sci-fi.",
];
const STRATEGY = STRATEGY_TOKENS.join("");

const IDEAS = [
  "Silhouetted hero on a rain-slick rooftop, neon haze",
  "Close-up eyes reflecting a burning city",
  "Vast chrome citadel under twin moons",
  "Lone figure walking into a wall of light",
];

const nodes = [
  node("title", STRING_INPUT, 0, 40, 230, "Title", { name: "title", value: "Neon Dynasty" }),
  node("genre", STRING_INPUT, 0, 230, 230, "Genre", { name: "genre", value: "Sci-fi thriller" }),
  node("audience", STRING_INPUT, 0, 420, 230, "Audience", { name: "audience", value: "Young adults" }),
  node("strategyPrompt", TEMPLATE, 340, 230, 290, "Strategy Prompt", {
    template: "A {{ genre }} poster for {{ title }}, aimed at {{ audience }}.",
  }),
  node("strategy", AGENT, 700, 60, 320, "Strategy", { prompt: "" }),
  node("notes", PREVIEW_NODE_TYPE, 700, 400, 300, "Strategy Notes", {}),
  node("ideas", LIST, 1110, 60, 300, "Prompt Ideas", { prompt: "" }),
  node("poster", TEXT_TO_IMAGE, 1500, 60, 300, "Movie Poster", { prompt: "" }),
];
const edges = [
  edge("e1", "title", "output", "strategyPrompt", "title"),
  edge("e2", "genre", "output", "strategyPrompt", "genre"),
  edge("e3", "audience", "output", "strategyPrompt", "audience"),
  edge("e4", "strategyPrompt", "output", "strategy", "prompt"),
  edge("e5", "strategy", "text", "notes", "value"),
  edge("e6", "strategy", "text", "ideas", "prompt"),
  edge("e7", "ideas", "output", "poster", "prompt"),
];

const streamIdeas = (start: number, span: number): CastEvent[] =>
  IDEAS.flatMap((item, i) => {
    const t = Math.round(start + (span * i) / IDEAS.length);
    return [
      m.output(t, "ideas", "Prompt Ideas", "item", item, "str"),
      m.output(t + 20, "ideas", "Prompt Ideas", "index", i, "int"),
    ];
  });

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "title", "Title", STRING_INPUT, "running"),
  m.nodeUpdate(500, "genre", "Genre", STRING_INPUT, "running"),
  m.nodeUpdate(700, "audience", "Audience", STRING_INPUT, "running"),
  m.nodeUpdate(1400, "title", "Title", STRING_INPUT, "completed", { output: "Neon Dynasty" }),
  m.nodeUpdate(1500, "genre", "Genre", STRING_INPUT, "completed", { output: "Sci-fi thriller" }),
  m.nodeUpdate(1600, "audience", "Audience", STRING_INPUT, "completed", { output: "Young adults" }),
  m.edgeUpdate(1800, "e1", "active"),
  m.edgeUpdate(1900, "e2", "active"),
  m.edgeUpdate(2000, "e3", "active"),

  m.nodeUpdate(2500, "strategyPrompt", "Strategy Prompt", TEMPLATE, "running"),
  m.nodeUpdate(3200, "strategyPrompt", "Strategy Prompt", TEMPLATE, "completed", {
    output: "A Sci-fi thriller poster for Neon Dynasty, aimed at Young adults.",
  }),
  m.edgeUpdate(3300, "e1", "completed"),
  m.edgeUpdate(3400, "e2", "completed"),
  m.edgeUpdate(3500, "e3", "completed"),
  m.edgeUpdate(3700, "e4", "active"),

  m.nodeUpdate(4200, "strategy", "Strategy", AGENT, "running"),
  ...m.stream("strategy", STRATEGY_TOKENS, 4700, 5200),
  m.nodeUpdate(10200, "strategy", "Strategy", AGENT, "completed", { text: STRATEGY }),
  m.edgeUpdate(10400, "e4", "completed"),
  m.edgeUpdate(10600, "e5", "active"),
  m.edgeUpdate(10700, "e6", "active"),

  m.nodeUpdate(11200, "notes", "Strategy Notes", PREVIEW_NODE_TYPE, "running"),
  m.output(11600, "notes", "Strategy Notes", "value", STRATEGY, "str"),
  m.nodeUpdate(11900, "notes", "Strategy Notes", PREVIEW_NODE_TYPE, "completed", { value: STRATEGY }),
  m.edgeUpdate(12000, "e5", "completed"),

  m.nodeUpdate(12100, "ideas", "Prompt Ideas", LIST, "running"),
  ...streamIdeas(12500, 4800),
  m.nodeUpdate(17600, "ideas", "Prompt Ideas", LIST, "completed", { output: IDEAS }),
  m.edgeUpdate(17800, "e6", "completed"),
  m.edgeUpdate(18000, "e7", "active"),

  m.nodeUpdate(18600, "poster", "Movie Poster", TEXT_TO_IMAGE, "running"),
  ...m.progress("poster", 12, 19000, 3600),
  m.nodeUpdate(22900, "poster", "Movie Poster", TEXT_TO_IMAGE, "completed", { output: poster }),
  m.edgeUpdate(23100, "e7", "completed"),
  m.jobUpdate(23400, "completed", { outputs: { poster } }),
];

export const moviePosterCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-movie-poster",
  name: "Movie Poster Generator",
  description: "Plan a strategy, stream poster ideas, and render the final poster.",
  createdAt: new Date(0).toISOString(),
  durationMs: 25500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Movie Poster Generator",
    "Inputs → Strategy → Prompt Ideas → Text To Image.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [TEMPLATE]: simpleMeta(TEMPLATE, "Template", "str", {
      inputs: ["title", "genre", "audience"],
      inline: ["template"],
      properties: [
        prop("template", "str"),
        prop("title", "str"),
        prop("genre", "str"),
        prop("audience", "str"),
      ],
    }),
    [AGENT]: textAgentMeta(AGENT, "Agent"),
    [PREVIEW_NODE_TYPE]: previewMeta("Strategy Notes"),
    [LIST]: listGeneratorMeta(),
    [TEXT_TO_IMAGE]: imageNodeMeta(TEXT_TO_IMAGE, "Text To Image"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
