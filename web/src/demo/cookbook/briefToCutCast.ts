/**
 * Creative pattern 1: brief to cut, unattended.
 *
 *   Brief → Director → Shot Batch → Shot Chain → Add Clips → Render Timeline → Output
 *
 * The Director writes the screenplay, Shot Chain films the shots in order (each
 * seeded from the previous clip's last frame), and the clips are cut into one
 * film. Fully synthetic: the clips and the cut come from the shipped Voltra
 * example timeline (demo/public/casts/cookbook-brief-to-cut).
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
  node,
  outputMeta,
  simpleMeta,
  stringInputMeta,
  textAgentMeta,
  videoNodeMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const DIRECTOR = "nodetool.creative.Director";
const SHOT_BATCH = "nodetool.creative.ShotBatch";
const SHOT_CHAIN = "nodetool.creative.ShotChain";
const ADD_CLIPS = "nodetool.timeline.AddClips";
const RENDER = "nodetool.timeline.RenderTimeline";

const WF = "wf-cookbook-brief-to-cut";
const JOB = "cookbook-brief-to-cut-job";
const m = castMessages(WF, JOB);

const BRIEF = "Teaser for the Voltra: a night run from the tunnel to the open road.";

const SCREENPLAY_TOKENS = [
  "TUNNEL RUN\n\n",
  "1. The tunnel lights ",
  "streak past.\n",
  "2. The headlight wakes ",
  "in the dark.\n",
  "3. The rear tyre throws ",
  "spray off the wet road.",
];
const SCREENPLAY = SCREENPLAY_TOKENS.join("");

const SHOTS = [
  { prompt: "Tunnel lights streaking past", duration: 2 },
  { prompt: "Headlight switching on in the dark", duration: 2 },
  { prompt: "Rear tyre throwing spray off wet asphalt", duration: 2 },
];
const CLIPS = [1, 2, 3].map((i) => assetRef("video", `clip-${i}.webm`));
const CUT = assetRef("video", "cut.webm");

const nodes = [
  node("brief", STRING_INPUT, 0, 60, 280, "Brief", { name: "brief", value: BRIEF }),
  node("director", DIRECTOR, 360, 40, 320, "Director", { brief: "" }),
  node("batch", SHOT_BATCH, 760, 80, 240, "Shot Batch", {}),
  node("chain", SHOT_CHAIN, 1080, 40, 340, "Shot Chain", {}),
  node("cut", ADD_CLIPS, 1500, 80, 240, "Add Clips", { name: "Tunnel Run" }),
  node("render", RENDER, 1820, 40, 340, "Render Timeline", {}),
  node("output", OUTPUT_NODE_TYPE, 2240, 40, 340, "Film", { name: "film" }),
];
const edges = [
  edge("e1", "brief", "output", "director", "brief"),
  edge("e2", "director", "screenplay", "batch", "screenplay"),
  edge("e3", "batch", "shots", "chain", "shots"),
  edge("e4", "chain", "videos", "cut", "clips"),
  edge("e5", "cut", "output", "render", "timeline"),
  edge("e6", "render", "output", "output", "value"),
];

const FIRST_SHOT_MS = 5000;
const SHOT_GAP_MS = 1500;

/** Shot Chain films one shot: a quick ramp, then the clip lands on the card. */
const shotEvents = (i: number): CastEvent[] => {
  const t = FIRST_SHOT_MS + i * SHOT_GAP_MS;
  return [
    ...m.progress("chain", 30, t, 1100),
    m.nodeUpdate(t + 1300, "chain", "Shot Chain", SHOT_CHAIN, "completed", {
      videos: CLIPS.slice(0, i + 1),
      output: CLIPS[i],
    }),
    ...(i < 2
      ? [m.nodeUpdate(t + 1400, "chain", "Shot Chain", SHOT_CHAIN, "running")]
      : []),
  ];
};

const CHAIN_DONE_MS = FIRST_SHOT_MS + 2 * SHOT_GAP_MS + 1300;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "brief", "Brief", STRING_INPUT, "running"),
  m.nodeUpdate(900, "brief", "Brief", STRING_INPUT, "completed", { output: BRIEF }),
  m.edgeUpdate(1000, "e1", "active"),

  m.nodeUpdate(1300, "director", "Director", DIRECTOR, "running"),
  ...m.stream("director", SCREENPLAY_TOKENS, 1500, 2300),
  m.nodeUpdate(3900, "director", "Director", DIRECTOR, "completed", { screenplay: SCREENPLAY }),
  m.edgeUpdate(4000, "e1", "completed"),
  m.edgeUpdate(4100, "e2", "active"),

  m.nodeUpdate(4200, "batch", "Shot Batch", SHOT_BATCH, "running"),
  m.nodeUpdate(4600, "batch", "Shot Batch", SHOT_BATCH, "completed", { shots: SHOTS }),
  m.edgeUpdate(4700, "e2", "completed"),
  m.edgeUpdate(4700, "e3", "active"),

  m.nodeUpdate(4900, "chain", "Shot Chain", SHOT_CHAIN, "running"),
  ...[0, 1, 2].flatMap(shotEvents),
  m.edgeUpdate(CHAIN_DONE_MS + 100, "e3", "completed"),
  m.edgeUpdate(CHAIN_DONE_MS + 200, "e4", "active"),

  m.nodeUpdate(CHAIN_DONE_MS + 300, "cut", "Add Clips", ADD_CLIPS, "running"),
  m.nodeUpdate(CHAIN_DONE_MS + 800, "cut", "Add Clips", ADD_CLIPS, "completed"),
  m.edgeUpdate(CHAIN_DONE_MS + 900, "e4", "completed"),
  m.edgeUpdate(CHAIN_DONE_MS + 1000, "e5", "active"),

  m.nodeUpdate(CHAIN_DONE_MS + 1100, "render", "Render Timeline", RENDER, "running"),
  ...m.progress("render", 36, CHAIN_DONE_MS + 1200, 1200),
  m.nodeUpdate(CHAIN_DONE_MS + 2500, "render", "Render Timeline", RENDER, "completed", {
    output: CUT,
  }),
  m.edgeUpdate(CHAIN_DONE_MS + 2600, "e5", "completed"),
  m.edgeUpdate(CHAIN_DONE_MS + 2700, "e6", "active"),

  m.nodeUpdate(CHAIN_DONE_MS + 2800, "output", "Film", OUTPUT_NODE_TYPE, "running"),
  m.output(CHAIN_DONE_MS + 3000, "output", "Film", "value", CUT, "video"),
  m.nodeUpdate(CHAIN_DONE_MS + 3200, "output", "Film", OUTPUT_NODE_TYPE, "completed", {
    value: CUT,
  }),
  m.edgeUpdate(CHAIN_DONE_MS + 3300, "e6", "completed"),
  m.jobUpdate(CHAIN_DONE_MS + 3400, "completed", { outputs: { film: CUT } }),
];

export const briefToCutCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-brief-to-cut",
  name: "Brief to Cut",
  description: "A brief becomes a screenplay, three chained shots, and a rendered film.",
  createdAt: new Date(0).toISOString(),
  durationMs: CHAIN_DONE_MS + 9000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Brief to Cut",
    "Brief → Director → Shot Batch → Shot Chain → Add Clips → Render Timeline → Output.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [DIRECTOR]: {
      ...textAgentMeta(DIRECTOR, "Director", [prop("brief", "str")], ["brief"]),
      outputs: [out("screenplay", "str"), out("chunk", "chunk", true)],
    },
    [SHOT_BATCH]: meta({
      node_type: SHOT_BATCH,
      title: "Shot Batch",
      properties: [prop("screenplay", "dict")],
      outputs: [out("shots", "list")],
      input_fields: ["screenplay"],
    }),
    [SHOT_CHAIN]: {
      ...videoNodeMeta(SHOT_CHAIN, "Shot Chain", [prop("shots", "list")]),
      outputs: [out("output", "video"), out("videos", "list")],
    },
    [ADD_CLIPS]: simpleMeta(ADD_CLIPS, "Add Clips To Timeline", "timeline", {
      inputs: ["clips"],
      inline: ["name"],
      properties: [prop("clips", "list"), prop("name", "str")],
    }),
    [RENDER]: videoNodeMeta(RENDER, "Render Timeline", [prop("timeline", "timeline")]),
    [OUTPUT_NODE_TYPE]: outputMeta("Film"),
  },
  events,
  assets: castAssets(["clip-1.webm", "clip-2.webm", "clip-3.webm", "cut.webm"]),
  viewport: fitViewport(nodes),
};
