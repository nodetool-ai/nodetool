/**
 * Creative pattern 3: one cast across many assets.
 *
 *   Brief → List Generator ⇢ Apply Entities ← Entity
 *                          ⇢ Text To Image ⇢ Collect → Output
 *
 * The List Generator streams one prompt per asset, Apply Entities appends the
 * entity's verbatim descriptor to each, and every image keeps the same product.
 * Fully synthetic: the entity reference and the four assets are frames from
 * the shipped Prism example timeline (demo/public/casts/cookbook-entity-cast).
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import {
  OUTPUT_NODE_TYPE,
  assetRef,
  castAssets,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageNodeMeta,
  listGeneratorMeta,
  node,
  outputMeta,
  simpleMeta,
  stringInputMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const LIST = "nodetool.generators.ListGenerator";
const ENTITY = "nodetool.constant.Entity";
const APPLY = "nodetool.creative.ApplyEntities";
const TEXT_TO_IMAGE = "nodetool.image.TextToImage";
const COLLECT = "nodetool.control.Collect";

const WF = "wf-cookbook-entity-cast";
const JOB = "cookbook-entity-cast-job";
const m = castMessages(WF, JOB);

const BRIEF = "Four launch assets for the Prism running shoe.";
const DESCRIPTOR =
  "Prism runner: white knit upper, rainbow-gradient midsole, orange pull tab.";
const ENTITY_IMAGE = assetRef("image", "entity.jpg");

const ASSETS = [
  "An athlete mid-stride on a track at dawn",
  "Macro of the knit upper",
  "The sole from below, gradient catching the light",
  "Pre-order poster with bold type",
].map((prompt, i) => ({
  prompt,
  seasoned: `${prompt}. ${DESCRIPTOR}`,
  image: assetRef("image", `asset-${i + 1}.jpg`),
}));
const IMAGES = ASSETS.map((a) => a.image);

const nodes = [
  node("brief", STRING_INPUT, 0, 40, 280, "Brief", { name: "brief", value: BRIEF }),
  node("ideas", LIST, 360, 20, 300, "List Generator", { prompt: "" }),
  node("entity", ENTITY, 360, 420, 300, "Prism Runner", { image: ENTITY_IMAGE }),
  node("apply", APPLY, 740, 200, 300, "Apply Entities", { text: "" }),
  node("image", TEXT_TO_IMAGE, 1120, 160, 300, "Text To Image", { prompt: "" }),
  node("collect", COLLECT, 1500, 200, 220, "Collect", {}),
  node("output", OUTPUT_NODE_TYPE, 1800, 160, 340, "Assets", { name: "assets" }),
];
const edges = [
  edge("e1", "brief", "output", "ideas", "prompt"),
  edge("e2", "ideas", "item", "apply", "text"),
  edge("e3", "entity", "output", "apply", "entities"),
  edge("e4", "apply", "prompt", "image", "prompt"),
  edge("e5", "image", "output", "collect", "input_item"),
  edge("e6", "collect", "output", "output", "value"),
];

const FIRST_ASSET_MS = 2400;
const ASSET_GAP_MS = 1500;

/** One asset: a prompt streams out, gets the entity, and renders. */
const assetEvents = (i: number): CastEvent[] => {
  const t = FIRST_ASSET_MS + i * ASSET_GAP_MS;
  const asset = ASSETS[i];
  return [
    m.output(t, "ideas", "List Generator", "item", asset.prompt, "str"),
    m.output(t + 20, "ideas", "List Generator", "index", i, "int"),
    m.nodeUpdate(t + 100, "apply", "Apply Entities", APPLY, "running"),
    m.nodeUpdate(t + 400, "apply", "Apply Entities", APPLY, "completed", {
      prompt: asset.seasoned,
      reference_images: [ENTITY_IMAGE],
    }),
    m.nodeUpdate(t + 500, "image", "Text To Image", TEXT_TO_IMAGE, "running"),
    ...m.progress("image", 30, t + 550, 850),
    m.nodeUpdate(t + 1450, "image", "Text To Image", TEXT_TO_IMAGE, "completed", {
      output: asset.image,
    }),
  ];
};

const DONE_MS = FIRST_ASSET_MS + 3 * ASSET_GAP_MS + 1450;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "brief", "Brief", STRING_INPUT, "running"),
  m.nodeUpdate(400, "entity", "Prism Runner", ENTITY, "running"),
  m.nodeUpdate(900, "brief", "Brief", STRING_INPUT, "completed", { output: BRIEF }),
  m.nodeUpdate(1000, "entity", "Prism Runner", ENTITY, "completed", { output: ENTITY_IMAGE }),
  m.edgeUpdate(1100, "e1", "active"),
  m.edgeUpdate(1200, "e3", "active"),

  m.nodeUpdate(1400, "ideas", "List Generator", LIST, "running"),
  m.edgeUpdate(FIRST_ASSET_MS, "e2", "active"),
  m.edgeUpdate(FIRST_ASSET_MS + 400, "e4", "active"),
  m.edgeUpdate(FIRST_ASSET_MS + 1450, "e5", "active"),
  m.nodeUpdate(FIRST_ASSET_MS + 1450, "collect", "Collect", COLLECT, "running"),
  ...[0, 1, 2, 3].flatMap(assetEvents),

  m.nodeUpdate(DONE_MS - 1300, "ideas", "List Generator", LIST, "completed", {
    output: ASSETS.map((a) => a.prompt),
  }),
  m.edgeUpdate(DONE_MS - 1200, "e1", "completed"),
  m.edgeUpdate(DONE_MS - 1100, "e2", "completed"),
  m.edgeUpdate(DONE_MS - 1000, "e3", "completed"),
  m.edgeUpdate(DONE_MS - 900, "e4", "completed"),
  m.edgeUpdate(DONE_MS + 100, "e5", "completed"),
  m.nodeUpdate(DONE_MS + 200, "collect", "Collect", COLLECT, "completed", { output: IMAGES }),
  m.edgeUpdate(DONE_MS + 300, "e6", "active"),

  m.nodeUpdate(DONE_MS + 500, "output", "Assets", OUTPUT_NODE_TYPE, "running"),
  m.output(DONE_MS + 700, "output", "Assets", "value", IMAGES, "list"),
  m.nodeUpdate(DONE_MS + 900, "output", "Assets", OUTPUT_NODE_TYPE, "completed", {
    value: IMAGES,
  }),
  m.edgeUpdate(DONE_MS + 1000, "e6", "completed"),
  m.jobUpdate(DONE_MS + 1100, "completed", { outputs: { assets: IMAGES } }),
];
// The prompts stream, so their events interleave with the stages around them.
events.sort((a, b) => a.t - b.t);

export const entityCastCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-entity-cast",
  name: "One Cast Across Many Assets",
  description: "Stream asset prompts, season each with an entity, and render them all.",
  createdAt: new Date(0).toISOString(),
  durationMs: DONE_MS + 3500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "One Cast Across Many Assets",
    "Brief → List Generator → Apply Entities ← Entity → Text To Image → Collect → Output.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [LIST]: listGeneratorMeta(),
    [ENTITY]: meta({
      node_type: ENTITY,
      title: "Entity",
      properties: [prop("value", "entity"), prop("image", "image")],
      outputs: [out("output", "entity")],
      inline_fields: ["value"],
      input_fields: ["image"],
    }),
    [APPLY]: meta({
      node_type: APPLY,
      title: "Apply Entities",
      properties: [prop("text", "str"), prop("entities", "list")],
      outputs: [out("prompt", "str"), out("reference_images", "list")],
      input_fields: ["text", "entities"],
    }),
    [TEXT_TO_IMAGE]: imageNodeMeta(TEXT_TO_IMAGE, "Text To Image"),
    [COLLECT]: simpleMeta(COLLECT, "Collect", "list", {
      inputs: ["input_item"],
      properties: [prop("input_item", "any")],
    }),
    [OUTPUT_NODE_TYPE]: outputMeta("Assets"),
  },
  events,
  assets: castAssets([
    "entity.jpg",
    "asset-1.jpg",
    "asset-2.jpg",
    "asset-3.jpg",
    "asset-4.jpg",
  ]),
  viewport: fitViewport(nodes),
};
