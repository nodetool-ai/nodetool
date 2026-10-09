/**
 * The workflow the node-based workflows hero animates, and the clock every
 * beat of the reel reads.
 *
 * Every node is a real registry type with its real title: a list of five
 * shot prompts runs through For Each, Text To Image, Image To Video, Collect
 * and Concatenate Video into an Output. The shots, stills and clips are the
 * shipped "Under the Bed" storyboard the homepage hero follows
 * (src/heroflow/data.ts), and the models are the ones that board used.
 * The swap beat names image models and the providers that serve them in
 * marketing/src/data/calculatorPricing.generated.ts.
 */
import { BEATS } from "../heroflow/data";
import { C } from "../heroflow/theme";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const SECONDS = 22;
export const DURATION_FRAMES = SECONDS * FPS;

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** 0 at `a`, 1 at `b`, linear between. */
export const span = (t: number, a: number, b: number): number =>
  clamp01((t - a) / (b - a));
export const expoOut = (x: number): number =>
  x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
export const inOut = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
/** Overshooting ease for node entrances. */
export const backOut = (x: number, s = 1.9): number => {
  const k = clamp01(x) - 1;
  return 1 + (s + 1) * k * k * k + s * k * k;
};

/** Piecewise keyframes with an in-out ease between neighbours. */
export const kf = (t: number, keys: ReadonlyArray<readonly [number, number]>): number => {
  if (t <= keys[0][0]) {
    return keys[0][1];
  }
  for (let k = 1; k < keys.length; k++) {
    const [t0, v0] = keys[k - 1];
    const [t1, v1] = keys[k];
    if (t <= t1) {
      return v0 + (v1 - v0) * inOut(span(t, t0, t1));
    }
  }
  return keys[keys.length - 1][1];
};

// ─── Beats (seconds) ────────────────────────────────────────────────────────

export const B = {
  title: [0, 2.3],
  build: [2.0, 6.2],
  reject: [6.3, 8.4],
  run: 8.6,
  itemGap: 0.48,
  swap: [14.8, 17.0],
  wall: [17.0, 18.8],
  end: [18.6, 22]
} as const;

// ─── Types and ports ────────────────────────────────────────────────────────

export type PortType = "text" | "list" | "int" | "image" | "video" | "videos";

export const PORT_COLOR: Record<PortType, string> = {
  text: C.textual,
  list: C.textual,
  int: C.info,
  image: C.image,
  video: C.video,
  videos: C.video
};

export type Port = { name: string; type: PortType };

export type NodeId =
  | "shots"
  | "foreach"
  | "image"
  | "video"
  | "collect"
  | "concat"
  | "output";

export type NodeSpec = {
  id: NodeId;
  title: string;
  /** The registry type, printed small under the title. */
  type: string;
  x: number;
  y: number;
  w: number;
  inputs: Port[];
  outputs: Port[];
  bodyH: number;
  /** When the node lands, in seconds. */
  enter: number;
};

export const HEADER = 54;
export const ROW = 34;

export const NODES: Record<NodeId, NodeSpec> = {
  shots: {
    id: "shots",
    title: "String List Input",
    type: "nodetool.input.StringListInput",
    x: 40,
    y: 330,
    w: 340,
    inputs: [],
    outputs: [{ name: "output", type: "list" }],
    bodyH: 236,
    enter: 2.15
  },
  foreach: {
    id: "foreach",
    title: "For Each",
    type: "nodetool.control.ForEach",
    x: 470,
    y: 400,
    w: 250,
    inputs: [{ name: "input_list", type: "list" }],
    outputs: [
      { name: "output", type: "text" },
      { name: "index", type: "int" }
    ],
    bodyH: 92,
    enter: 2.55
  },
  image: {
    id: "image",
    title: "Text To Image",
    type: "nodetool.image.TextToImage",
    x: 810,
    y: 250,
    w: 420,
    inputs: [{ name: "prompt", type: "text" }],
    outputs: [{ name: "output", type: "image" }],
    bodyH: 300,
    enter: 2.95
  },
  video: {
    id: "video",
    title: "Image To Video",
    type: "nodetool.video.ImageToVideo",
    x: 1320,
    y: 250,
    w: 420,
    inputs: [{ name: "image", type: "image" }],
    outputs: [{ name: "output", type: "video" }],
    bodyH: 300,
    enter: 3.35
  },
  collect: {
    id: "collect",
    title: "Collect",
    type: "nodetool.control.Collect",
    x: 1830,
    y: 400,
    w: 260,
    inputs: [{ name: "input_item", type: "video" }],
    outputs: [{ name: "output", type: "videos" }],
    bodyH: 110,
    enter: 3.75
  },
  concat: {
    id: "concat",
    title: "Concatenate Video",
    type: "nodetool.video.Concat",
    x: 2180,
    y: 400,
    w: 300,
    inputs: [{ name: "videos", type: "videos" }],
    outputs: [{ name: "output", type: "video" }],
    bodyH: 110,
    enter: 4.15
  },
  output: {
    id: "output",
    title: "Output",
    type: "nodetool.output.Output",
    x: 2570,
    y: 250,
    w: 560,
    inputs: [{ name: "value", type: "video" }],
    outputs: [],
    bodyH: 315,
    enter: 4.55
  }
};

export const NODE_LIST: NodeSpec[] = Object.values(NODES);

const portY = (n: NodeSpec, i: number): number =>
  n.y + HEADER + i * ROW + ROW / 2;

export const outAt = (id: NodeId, i = 0): [number, number] => [
  NODES[id].x + NODES[id].w,
  portY(NODES[id], i)
];
export const inAt = (id: NodeId, i = 0): [number, number] => [
  NODES[id].x,
  portY(NODES[id], i)
];

export type EdgeSpec = {
  from: NodeId;
  to: NodeId;
  type: PortType;
  /** When the wire starts drawing, in seconds. */
  draw: number;
};

export const EDGES: EdgeSpec[] = [
  { from: "shots", to: "foreach", type: "list", draw: 3.0 },
  { from: "foreach", to: "image", type: "text", draw: 3.45 },
  { from: "image", to: "video", type: "image", draw: 3.9 },
  { from: "video", to: "collect", type: "video", draw: 4.35 },
  { from: "collect", to: "concat", type: "videos", draw: 4.8 },
  { from: "concat", to: "output", type: "video", draw: 5.25 }
];
export const WIRE_DRAW = 0.5;

export const edgePoints = (e: EdgeSpec): [[number, number], [number, number]] => [
  outAt(e.from),
  inAt(e.to)
];

/** Control points of the editor's horizontal bezier. */
export const bezierCtrl = (
  [x1, y1]: readonly [number, number],
  [x2, y2]: readonly [number, number]
): number[] => {
  const dx = Math.max(70, (x2 - x1) * 0.5);
  return [x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2];
};

export const bezierPath = (
  a: readonly [number, number],
  b: readonly [number, number]
): string => {
  const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = bezierCtrl(a, b);
  return `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
};

export const bezierAt = (
  a: readonly [number, number],
  b: readonly [number, number],
  u: number
): [number, number] => {
  const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = bezierCtrl(a, b);
  const v = 1 - u;
  return [
    v * v * v * x1 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x2,
    v * v * v * y1 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y2
  ];
};

// ─── The run ────────────────────────────────────────────────────────────────

export const SHOTS = BEATS.map((b) => ({
  name: b.slug,
  still: b.still,
  clip: b.clip,
  clipFrame: b.clipFrame
}));
export const SHOT_COUNT = SHOTS.length;

/** Start of item `i`'s pass through For Each. */
export const itemAt = (i: number): number => B.run + 0.2 + i * B.itemGap;
export const IMAGE_RENDER = 0.42;
export const VIDEO_RENDER = 0.48;
export const imageAt = (i: number): number => itemAt(i) + 0.12;
export const videoAt = (i: number): number => imageAt(i) + IMAGE_RENDER + 0.06;
export const collectedAt = (i: number): number => videoAt(i) + VIDEO_RENDER + 0.08;
export const CONCAT: readonly [number, number] = [
  collectedAt(SHOT_COUNT - 1) + 0.1,
  collectedAt(SHOT_COUNT - 1) + 0.75
];
export const FILM_AT = CONCAT[1] + 0.1;

export type RunState = "idle" | "running" | "done";

/** Index of the item a per-item node is on at `t`, or -1 before the first. */
export const currentItem = (t: number, start: (i: number) => number): number => {
  let k = -1;
  for (let i = 0; i < SHOT_COUNT; i++) {
    if (t >= start(i)) {
      k = i;
    }
  }
  return k;
};

export const nodeState = (id: NodeId, t: number): RunState => {
  if (t < B.run) {
    return "idle";
  }
  const last = SHOT_COUNT - 1;
  switch (id) {
    case "shots":
      return t < B.run + 0.2 ? "running" : "done";
    case "foreach":
      return t < itemAt(last) + 0.3 ? "running" : "done";
    case "image":
      return t < imageAt(0) ? "idle" : t < imageAt(last) + IMAGE_RENDER ? "running" : "done";
    case "video":
      return t < videoAt(0) ? "idle" : t < videoAt(last) + VIDEO_RENDER ? "running" : "done";
    case "collect":
      return t < collectedAt(0) ? "idle" : t < collectedAt(last) + 0.05 ? "running" : "done";
    case "concat":
      return t < CONCAT[0] ? "idle" : t < CONCAT[1] ? "running" : "done";
    case "output":
      return t < FILM_AT ? "idle" : "done";
  }
};

/** Packets on a wire: one per item, travelling for `len` seconds from `start(i)`. */
export const packets = (
  t: number,
  start: (i: number) => number,
  len: number,
  count = SHOT_COUNT
): number[] => {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = (t - start(i)) / len;
    if (u >= 0 && u <= 1) {
      out.push(u);
    }
  }
  return out;
};

// ─── Model swap ─────────────────────────────────────────────────────────────

export const MODELS = [
  { name: "Seedream 4", provider: "Together AI" },
  { name: "FLUX.1 Schnell", provider: "Together AI" },
  { name: "Imagen 4", provider: "fal" },
  { name: "GPT Image 2", provider: "AtlasCloud" },
  { name: "Seedream 4", provider: "Together AI" }
] as const;
export const VIDEO_MODEL = "Seedance Pro";

export const modelIndex = (t: number): number => {
  const [a, b] = B.swap;
  if (t < a + 0.35) {
    return 0;
  }
  const step = (b - a - 0.5) / (MODELS.length - 1);
  return Math.min(MODELS.length - 1, Math.floor((t - a - 0.35) / step) + 1);
};

// ─── The wall of nodes ──────────────────────────────────────────────────────

/** Real node titles from the registry, grouped by the port color they wear. */
export const WALL: { title: string; color: string }[][] = [
  [
    { title: "Text To Image", color: C.image },
    { title: "Upscale Image", color: C.image },
    { title: "Remove Background", color: C.image },
    { title: "Image To Image", color: C.image },
    { title: "Segment Image", color: C.image },
    { title: "Apply Mask", color: C.image },
    { title: "Compare Images", color: C.image },
    { title: "Image To 3D", color: C.image },
    { title: "Resize Image", color: C.image }
  ],
  [
    { title: "Text To Video", color: C.video },
    { title: "Image To Video", color: C.video },
    { title: "Concatenate Video", color: C.video },
    { title: "Extract Video Frame", color: C.video },
    { title: "Extract Audio", color: C.video },
    { title: "Trim", color: C.video },
    { title: "Overlay", color: C.video },
    { title: "Text To 3D", color: C.video }
  ],
  [
    { title: "Text To Speech", color: C.audio },
    { title: "Speech to Text", color: C.audio },
    { title: "Text To Music", color: C.audio },
    { title: "Overlay Audio", color: C.audio },
    { title: "Concatenate Audio", color: C.audio },
    { title: "Mixer", color: C.audio },
    { title: "Transcribe", color: C.audio },
    { title: "Translate", color: C.audio }
  ],
  [
    { title: "Agent", color: C.textual },
    { title: "Summarizer", color: C.textual },
    { title: "Extractor", color: C.textual },
    { title: "Classifier", color: C.textual },
    { title: "Structured Output Generator", color: C.textual },
    { title: "Enhance Prompt", color: C.textual },
    { title: "Web Search", color: C.textual },
    { title: "Chart Generator", color: C.textual }
  ],
  [
    { title: "For Each", color: C.info },
    { title: "If", color: C.info },
    { title: "Switch", color: C.info },
    { title: "Collect", color: C.info },
    { title: "Fallback", color: C.info },
    { title: "Subgraph", color: C.info },
    { title: "Code", color: C.info },
    { title: "Hybrid Search", color: C.info },
    { title: "Webhook Trigger", color: C.info }
  ]
];
