/**
 * Creative pattern 6: variant fan-out from one brief.
 *
 *   Brief → Art Director (Agent) → Prompt ← Count
 *         → List Generator ⇢ Text To Image ⇢ Collect → Output
 *                         ⇢ Preview
 *
 * An Agent turns the brief into a direction, a Prompt node states the count,
 * the List Generator streams that many poster prompts, and each prompt renders
 * as it arrives. Fully synthetic: the four posters are different shots from
 * the shipped Voltra example timeline (assets/patternMedia.ts), so the gallery
 * shows four distinct variants.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import {
  POSTER_HERO_IMAGE,
  POSTER_RIDER_IMAGE,
  POSTER_ROOFTOP_IMAGE,
  POSTER_SIDE_IMAGE,
} from "../assets/patternMedia";
import {
  OUTPUT_NODE_TYPE,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageNodeMeta,
  listGeneratorMeta,
  node,
  outputMeta,
  previewMeta,
  simpleMeta,
  stringInputMeta,
  textAgentMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const INTEGER_INPUT = "nodetool.input.IntegerInput";
const AGENT = "nodetool.agents.Agent";
const PROMPT = "nodetool.text.Prompt";
const LIST = "nodetool.generators.ListGenerator";
const TEXT_TO_IMAGE = "nodetool.image.TextToImage";
const COLLECT = "nodetool.control.Collect";

const WF = "wf-cookbook-variant-fan-out";
const JOB = "cookbook-variant-fan-out-job";
const m = castMessages(WF, JOB);

const BRIEF = "Launch posters for the Voltra electric motorcycle.";

const DIRECTION_TOKENS = [
  "Night city, ",
  "wet asphalt, ",
  "teal accent light against warm signage. ",
  "The bike is the hero in every frame; ",
  "vary the angle, not the mood.",
];
const DIRECTION = DIRECTION_TOKENS.join("");
const ASK = `Write 4 distinct poster prompts. Direction: ${DIRECTION}`;

const VARIANTS = [
  { prompt: "The bike under neon signs, low three-quarter view", image: POSTER_HERO_IMAGE },
  { prompt: "Parked on a rooftop, skyline glowing at dusk", image: POSTER_ROOFTOP_IMAGE },
  { prompt: "Clean side profile on black, rim light", image: POSTER_SIDE_IMAGE },
  { prompt: "The rider's helmet, city reflected in the visor", image: POSTER_RIDER_IMAGE },
].map((v) => ({ prompt: v.prompt, image: { type: "image", uri: v.image } }));
const PROMPTS = VARIANTS.map((v) => v.prompt);
const POSTERS = VARIANTS.map((v) => v.image);

const nodes = [
  node("brief", STRING_INPUT, 0, 40, 280, "Brief", { name: "brief", value: BRIEF }),
  node("count", INTEGER_INPUT, 0, 340, 220, "Count", { name: "count", value: 4 }),
  node("director", AGENT, 360, 20, 320, "Art Director", { prompt: "" }),
  node("ask", PROMPT, 360, 360, 300, "Prompt", {
    prompt: "Write {{ count }} distinct poster prompts. Direction: {{ direction }}",
  }),
  node("ideas", LIST, 760, 20, 300, "List Generator", { prompt: "" }),
  node("preview", PREVIEW_NODE_TYPE, 760, 400, 300, "Prompt Ideas", {}),
  node("poster", TEXT_TO_IMAGE, 1140, 20, 300, "Text To Image", { prompt: "" }),
  node("collect", COLLECT, 1520, 60, 220, "Collect", {}),
  node("output", OUTPUT_NODE_TYPE, 1820, 20, 340, "Posters", { name: "posters" }),
];
const edges = [
  edge("e1", "brief", "output", "director", "prompt"),
  edge("e2", "director", "text", "ask", "direction"),
  edge("e3", "count", "output", "ask", "count"),
  edge("e4", "ask", "output", "ideas", "prompt"),
  edge("e5", "ideas", "item", "poster", "prompt"),
  edge("e6", "ideas", "item", "preview", "value"),
  edge("e7", "poster", "output", "collect", "input_item"),
  edge("e8", "collect", "output", "output", "value"),
];

const FIRST_IDEA_MS = 6100;
const IDEA_GAP_MS = 1300;

/** One variant: the List Generator streams its prompt, Text To Image renders it. */
const variantEvents = (i: number): CastEvent[] => {
  const t = FIRST_IDEA_MS + i * IDEA_GAP_MS;
  return [
    m.output(t, "ideas", "List Generator", "item", PROMPTS[i], "str"),
    m.output(t + 20, "ideas", "List Generator", "index", i, "int"),
    m.output(t + 100, "preview", "Prompt Ideas", "value", PROMPTS[i], "str"),
    m.nodeUpdate(t + 200, "poster", "Text To Image", TEXT_TO_IMAGE, "running"),
    ...m.progress("poster", 30, t + 250, 900),
    m.nodeUpdate(t + 1200, "poster", "Text To Image", TEXT_TO_IMAGE, "completed", {
      output: POSTERS[i],
    }),
  ];
};

const DONE_MS = FIRST_IDEA_MS + 3 * IDEA_GAP_MS + 1200;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "brief", "Brief", STRING_INPUT, "running"),
  m.nodeUpdate(400, "count", "Count", INTEGER_INPUT, "running"),
  m.nodeUpdate(900, "brief", "Brief", STRING_INPUT, "completed", { output: BRIEF }),
  m.nodeUpdate(1000, "count", "Count", INTEGER_INPUT, "completed", { output: 4 }),
  m.edgeUpdate(1100, "e1", "active"),
  m.edgeUpdate(1200, "e3", "active"),

  m.nodeUpdate(1400, "director", "Art Director", AGENT, "running"),
  ...m.stream("director", DIRECTION_TOKENS, 1600, 2200),
  m.nodeUpdate(4000, "director", "Art Director", AGENT, "completed", { text: DIRECTION }),
  m.edgeUpdate(4100, "e1", "completed"),
  m.edgeUpdate(4200, "e2", "active"),

  m.nodeUpdate(4400, "ask", "Prompt", PROMPT, "running"),
  m.nodeUpdate(4800, "ask", "Prompt", PROMPT, "completed", { output: ASK }),
  m.edgeUpdate(4900, "e2", "completed"),
  m.edgeUpdate(4900, "e3", "completed"),
  m.edgeUpdate(5000, "e4", "active"),

  m.nodeUpdate(5200, "ideas", "List Generator", LIST, "running"),
  m.edgeUpdate(FIRST_IDEA_MS, "e5", "active"),
  m.edgeUpdate(FIRST_IDEA_MS, "e6", "active"),
  m.nodeUpdate(FIRST_IDEA_MS + 50, "preview", "Prompt Ideas", PREVIEW_NODE_TYPE, "running"),
  m.edgeUpdate(FIRST_IDEA_MS + 1300, "e7", "active"),
  m.nodeUpdate(FIRST_IDEA_MS + 1300, "collect", "Collect", COLLECT, "running"),
  ...[0, 1, 2, 3].flatMap(variantEvents),

  m.nodeUpdate(DONE_MS - 1100, "ideas", "List Generator", LIST, "completed", { output: PROMPTS }),
  m.nodeUpdate(DONE_MS - 1000, "preview", "Prompt Ideas", PREVIEW_NODE_TYPE, "completed"),
  m.edgeUpdate(DONE_MS - 1000, "e4", "completed"),
  m.edgeUpdate(DONE_MS - 900, "e6", "completed"),
  m.edgeUpdate(DONE_MS + 100, "e5", "completed"),
  m.edgeUpdate(DONE_MS + 200, "e7", "completed"),
  m.nodeUpdate(DONE_MS + 300, "collect", "Collect", COLLECT, "completed", { output: POSTERS }),
  m.edgeUpdate(DONE_MS + 400, "e8", "active"),

  m.nodeUpdate(DONE_MS + 600, "output", "Posters", OUTPUT_NODE_TYPE, "running"),
  m.output(DONE_MS + 800, "output", "Posters", "value", POSTERS, "list"),
  m.nodeUpdate(DONE_MS + 1000, "output", "Posters", OUTPUT_NODE_TYPE, "completed", {
    value: POSTERS,
  }),
  m.edgeUpdate(DONE_MS + 1100, "e8", "completed"),
  m.jobUpdate(DONE_MS + 1200, "completed", { outputs: { posters: POSTERS } }),
];
// The prompts stream, so their events interleave with the stages around them.
events.sort((a, b) => a.t - b.t);

export const variantFanOutCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-variant-fan-out",
  name: "Variant Fan-Out",
  description: "One brief becomes a direction, four prompts, and four posters.",
  createdAt: new Date(0).toISOString(),
  durationMs: DONE_MS + 3500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Variant Fan-Out",
    "Brief → Agent → Prompt → List Generator → Text To Image → Collect → Output.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [INTEGER_INPUT]: meta({
      node_type: INTEGER_INPUT,
      title: "Integer Input",
      properties: [prop("name", "str"), prop("value", "int")],
      outputs: [out("output", "int")],
      inline_fields: ["value"],
      input_fields: [],
    }),
    [AGENT]: textAgentMeta(AGENT, "Agent"),
    [PROMPT]: simpleMeta(PROMPT, "Prompt", "str", {
      inputs: ["direction", "count"],
      inline: ["prompt"],
      properties: [prop("prompt", "str"), prop("direction", "str"), prop("count", "int")],
    }),
    [LIST]: listGeneratorMeta(),
    [PREVIEW_NODE_TYPE]: previewMeta("Prompt Ideas"),
    [TEXT_TO_IMAGE]: imageNodeMeta(TEXT_TO_IMAGE, "Text To Image"),
    [COLLECT]: simpleMeta(COLLECT, "Collect", "list", {
      inputs: ["input_item"],
      properties: [prop("input_item", "any")],
    }),
    [OUTPUT_NODE_TYPE]: outputMeta("Posters"),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
