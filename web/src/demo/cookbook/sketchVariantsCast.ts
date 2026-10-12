/**
 * Creative pattern 5: a sketch as the control input.
 *
 *   Sketch → Render Sketch ──────────────┐
 *   Styles → For Each → (style) ──→ Image To Image ⇢ Collect → Output
 *
 * Render Sketch flattens the sketch to an image, For Each streams one style at
 * a time, and Image To Image re-renders the same composition once per style.
 * Fully synthetic: the sketch is traced from the shipped Voltra hero shot and
 * each variant is a different grade of that shot (demo/public/casts/cookbook-sketch-variants), so
 * every render keeps the sketch's composition but looks different from it and
 * from the others.
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
  node,
  outputMeta,
  simpleMeta,
} from "./builders";

const SKETCH = "nodetool.constant.Sketch";
const RENDER_SKETCH = "nodetool.sketch.RenderSketch";
const STRING_LIST_INPUT = "nodetool.input.StringListInput";
const FOR_EACH = "nodetool.control.ForEach";
const IMAGE_TO_IMAGE = "nodetool.image.ImageToImage";
const COLLECT = "nodetool.control.Collect";

const WF = "wf-cookbook-sketch-variants";
const JOB = "cookbook-sketch-variants-job";
const m = castMessages(WF, JOB);

const sketch = assetRef("image", "sketch.jpg");
const STYLES = [
  { name: "Film noir, hard light", render: assetRef("image", "noir.jpg") },
  { name: "Retro neon, red and green", render: assetRef("image", "retro.jpg") },
  { name: "Teal night, wet asphalt", render: assetRef("image", "teal.jpg") },
];
const STYLE_NAMES = STYLES.map((s) => s.name);
const RENDERS = STYLES.map((s) => s.render);

const nodes = [
  node("sketch", SKETCH, 0, 40, 300, "Sketch", { image: sketch }),
  node("render", RENDER_SKETCH, 400, 40, 300, "Render Sketch", {}),
  node("styles", STRING_LIST_INPUT, 0, 400, 300, "Styles", { name: "styles", value: STYLE_NAMES }),
  node("each", FOR_EACH, 400, 420, 240, "For Each", {}),
  node("restyle", IMAGE_TO_IMAGE, 800, 200, 320, "Image To Image", { prompt: "" }),
  node("collect", COLLECT, 1200, 240, 220, "Collect", {}),
  node("output", OUTPUT_NODE_TYPE, 1500, 200, 340, "Variants", { name: "variants" }),
];
const edges = [
  edge("e1", "sketch", "output", "render", "sketch"),
  edge("e2", "render", "image", "restyle", "image"),
  edge("e3", "styles", "output", "each", "input_list"),
  edge("e4", "each", "output", "restyle", "prompt"),
  edge("e5", "restyle", "output", "collect", "input_item"),
  edge("e6", "collect", "output", "output", "value"),
];

const FIRST_STYLE_MS = 4600;
const STYLE_GAP_MS = 1500;

/** One style: For Each hands it over, Image To Image renders it. */
const styleEvents = (i: number): CastEvent[] => {
  const t = FIRST_STYLE_MS + i * STYLE_GAP_MS;
  return [
    m.output(t - 200, "each", "For Each", "output", STYLE_NAMES[i], "str"),
    m.nodeUpdate(t, "restyle", "Image To Image", IMAGE_TO_IMAGE, "running"),
    ...m.progress("restyle", 30, t + 100, 1000),
    m.nodeUpdate(t + 1200, "restyle", "Image To Image", IMAGE_TO_IMAGE, "completed", {
      output: RENDERS[i],
    }),
  ];
};

const DONE_MS = FIRST_STYLE_MS + 2 * STYLE_GAP_MS + 1200;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "sketch", "Sketch", SKETCH, "running"),
  m.nodeUpdate(400, "styles", "Styles", STRING_LIST_INPUT, "running"),
  m.nodeUpdate(900, "sketch", "Sketch", SKETCH, "completed", { output: sketch }),
  m.nodeUpdate(1000, "styles", "Styles", STRING_LIST_INPUT, "completed", { output: STYLE_NAMES }),
  m.edgeUpdate(1100, "e1", "active"),
  m.edgeUpdate(1200, "e3", "active"),

  m.nodeUpdate(1700, "render", "Render Sketch", RENDER_SKETCH, "running"),
  ...m.progress("render", 18, 1800, 600),
  m.nodeUpdate(2500, "render", "Render Sketch", RENDER_SKETCH, "completed", {
    image: sketch,
    mask: null,
  }),
  m.edgeUpdate(2600, "e1", "completed"),
  m.edgeUpdate(2700, "e2", "active"),

  m.nodeUpdate(3300, "each", "For Each", FOR_EACH, "running"),
  m.edgeUpdate(3400, "e3", "completed"),
  m.edgeUpdate(3500, "e4", "active"),
  m.edgeUpdate(FIRST_STYLE_MS + 1300, "e5", "active"),
  m.nodeUpdate(FIRST_STYLE_MS + 1300, "collect", "Collect", COLLECT, "running"),
  ...[0, 1, 2].flatMap(styleEvents),

  m.nodeUpdate(DONE_MS - 1200, "each", "For Each", FOR_EACH, "completed"),
  m.edgeUpdate(DONE_MS + 100, "e2", "completed"),
  m.edgeUpdate(DONE_MS + 100, "e4", "completed"),
  m.edgeUpdate(DONE_MS + 200, "e5", "completed"),
  m.nodeUpdate(DONE_MS + 300, "collect", "Collect", COLLECT, "completed", { output: RENDERS }),
  m.edgeUpdate(DONE_MS + 400, "e6", "active"),

  m.nodeUpdate(DONE_MS + 600, "output", "Variants", OUTPUT_NODE_TYPE, "running"),
  m.output(DONE_MS + 800, "output", "Variants", "value", RENDERS, "list"),
  m.nodeUpdate(DONE_MS + 1000, "output", "Variants", OUTPUT_NODE_TYPE, "completed", {
    value: RENDERS,
  }),
  m.edgeUpdate(DONE_MS + 1100, "e6", "completed"),
  m.jobUpdate(DONE_MS + 1200, "completed", { outputs: { variants: RENDERS } }),
];
// The styles stream, so their events interleave with the stages around them.
events.sort((a, b) => a.t - b.t);

export const sketchVariantsCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-sketch-variants",
  name: "Sketch Variants",
  description: "Render one sketch, then re-render its composition in three styles.",
  createdAt: new Date(0).toISOString(),
  durationMs: DONE_MS + 3500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Sketch Variants",
    "Sketch → Render Sketch → Image To Image (per style) → Collect → Output.",
    nodes,
    edges
  ),
  metadata: {
    [SKETCH]: meta({
      node_type: SKETCH,
      title: "Sketch",
      properties: [prop("value", "sketch"), prop("image", "image")],
      outputs: [out("output", "image")],
      inline_fields: ["value"],
      input_fields: ["image"],
    }),
    [RENDER_SKETCH]: meta({
      node_type: RENDER_SKETCH,
      title: "Render Sketch",
      properties: [prop("sketch", "sketch")],
      outputs: [out("image", "image"), out("mask", "image")],
      input_fields: ["sketch"],
    }),
    [STRING_LIST_INPUT]: simpleMeta(STRING_LIST_INPUT, "String List Input", "list", {
      inline: ["value"],
      properties: [prop("name", "str"), prop("value", "list")],
    }),
    [FOR_EACH]: meta({
      node_type: FOR_EACH,
      title: "For Each",
      properties: [prop("input_list", "list")],
      outputs: [out("output", "any", true), out("index", "int", true)],
      input_fields: ["input_list"],
      is_streaming_output: true,
    }),
    [IMAGE_TO_IMAGE]: imageNodeMeta(IMAGE_TO_IMAGE, "Image To Image", [
      prop("image", "image"),
      prop("prompt", "str"),
    ]),
    [COLLECT]: simpleMeta(COLLECT, "Collect", "list", {
      inputs: ["input_item"],
      properties: [prop("input_item", "any")],
    }),
    [OUTPUT_NODE_TYPE]: outputMeta("Variants"),
  },
  events,
  assets: castAssets(["sketch.jpg", "noir.jpg", "retro.jpg", "teal.jpg"]),
  viewport: fitViewport(nodes),
};
