/**
 * Creative pattern 2: shot fan-out through stills.
 *
 *   Brief → Director → Screenplay Shots ⇢ Text To Image ⇢ Image To Video
 *         ⇢ Collect → Add Clips → Render Timeline
 *
 * The Director writes a three-shot screenplay, Screenplay Shots streams one
 * prompt per shot, each prompt becomes a still and each still a clip, and the
 * clips are cut into one film. The shots overlap the way a streamed run does.
 * Fully synthetic: the stills, clips, and cut are frames from the shipped
 * Voltra example timeline (demo/public/casts/cookbook-shot-fan-out), so every stage shows new
 * media and the cast replays with no backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import {
  assetRef,
  castAssets,
  cookbookWorkflow,
  edge,
  fitViewport,
  imageNodeMeta,
  node,
  simpleMeta,
  stringInputMeta,
  textAgentMeta,
  videoNodeMeta,
} from "./builders";

const STRING_INPUT = "nodetool.input.StringInput";
const DIRECTOR = "nodetool.creative.Director";
const SHOTS = "nodetool.creative.ScreenplayShots";
const TEXT_TO_IMAGE = "nodetool.image.TextToImage";
const IMAGE_TO_VIDEO = "nodetool.video.ImageToVideo";
const COLLECT = "nodetool.control.Collect";
const ADD_CLIPS = "nodetool.timeline.AddClips";
const RENDER = "nodetool.timeline.RenderTimeline";

const WF = "wf-cookbook-shot-fan-out";
const JOB = "cookbook-shot-fan-out-job";
const m = castMessages(WF, JOB);

const BRIEF = "A night ride through a rain-soaked neon city, three shots.";

const SCREENPLAY_TOKENS = [
  "NIGHT RIDE\n\n",
  "1. Wide. Steam drifts over a wet street ",
  "under neon signs.\n",
  "2. Close. The rider's visor ",
  "catches the city lights.\n",
  "3. Tracking. The bike tears down ",
  "the avenue, spray off the tyres.",
];
const SCREENPLAY = SCREENPLAY_TOKENS.join("");


const SHOT_LIST = [
  {
    prompt: "Wide shot, steam over a wet neon street at night",
    still: assetRef("image", "still-1.jpg"),
    clip: assetRef("video", "clip-1.webm"),
  },
  {
    prompt: "Close-up, rider's visor reflecting neon signs",
    still: assetRef("image", "still-2.jpg"),
    clip: assetRef("video", "clip-2.webm"),
  },
  {
    prompt: "Tracking shot, electric bike racing down a rainy avenue",
    still: assetRef("image", "still-3.jpg"),
    clip: assetRef("video", "clip-3.webm"),
  },
];
const CUT = assetRef("video", "cut.webm");

const nodes = [
  node("brief", STRING_INPUT, 0, 60, 280, "Brief", { name: "brief", value: BRIEF }),
  node("director", DIRECTOR, 360, 40, 320, "Director", { brief: "" }),
  node("shots", SHOTS, 760, 60, 260, "Screenplay Shots", {}),
  node("still", TEXT_TO_IMAGE, 1100, 40, 300, "Text To Image", { prompt: "" }),
  node("clip", IMAGE_TO_VIDEO, 1480, 40, 320, "Image To Video", { prompt: "" }),
  node("collect", COLLECT, 1880, 60, 220, "Collect", {}),
  node("cut", ADD_CLIPS, 2180, 60, 240, "Add Clips", { name: "Night Ride" }),
  node("render", RENDER, 2500, 40, 340, "Render Timeline", {}),
];
const edges = [
  edge("e1", "brief", "output", "director", "brief"),
  edge("e2", "director", "screenplay", "shots", "screenplay"),
  edge("e3", "shots", "shot_prompt", "still", "prompt"),
  edge("e4", "still", "output", "clip", "image"),
  edge("e5", "clip", "output", "collect", "input_item"),
  edge("e6", "collect", "output", "cut", "clips"),
  edge("e7", "cut", "output", "render", "timeline"),
];

/** First shot's still starts here; each later shot starts SHOT_GAP_MS after. */
const FIRST_SHOT_MS = 4900;
const SHOT_GAP_MS = 1400;

/** One shot's trip: prompt out of Screenplay Shots, a still, then a clip. */
const shotEvents = (i: number): CastEvent[] => {
  const shot = SHOT_LIST[i];
  const t = FIRST_SHOT_MS + i * SHOT_GAP_MS;
  return [
    m.output(t - 200, "shots", "Screenplay Shots", "shot_prompt", shot.prompt, "str"),
    m.nodeUpdate(t, "still", "Text To Image", TEXT_TO_IMAGE, "running"),
    ...m.progress("still", 24, t + 100, 800),
    m.nodeUpdate(t + 1000, "still", "Text To Image", TEXT_TO_IMAGE, "completed", {
      output: shot.still,
    }),
    m.nodeUpdate(t + 1100, "clip", "Image To Video", IMAGE_TO_VIDEO, "running"),
    ...m.progress("clip", 30, t + 1200, 1000),
    m.nodeUpdate(t + 2300, "clip", "Image To Video", IMAGE_TO_VIDEO, "completed", {
      output: shot.clip,
    }),
  ];
};

const LAST_CLIP_MS = FIRST_SHOT_MS + 2 * SHOT_GAP_MS + 2300;

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "brief", "Brief", STRING_INPUT, "running"),
  m.nodeUpdate(900, "brief", "Brief", STRING_INPUT, "completed", { output: BRIEF }),
  m.edgeUpdate(1000, "e1", "active"),

  m.nodeUpdate(1300, "director", "Director", DIRECTOR, "running"),
  ...m.stream("director", SCREENPLAY_TOKENS, 1500, 2400),
  m.nodeUpdate(4100, "director", "Director", DIRECTOR, "completed", { screenplay: SCREENPLAY }),
  m.edgeUpdate(4200, "e1", "completed"),
  m.edgeUpdate(4300, "e2", "active"),

  m.nodeUpdate(4500, "shots", "Screenplay Shots", SHOTS, "running"),
  m.edgeUpdate(4600, "e3", "active"),
  m.edgeUpdate(5900, "e4", "active"),
  m.edgeUpdate(7200, "e5", "active"),
  m.nodeUpdate(7200, "collect", "Collect", COLLECT, "running"),
  ...[0, 1, 2].flatMap(shotEvents),

  m.nodeUpdate(LAST_CLIP_MS - 1400, "shots", "Screenplay Shots", SHOTS, "completed", {
    output: SHOT_LIST.map((s) => s.prompt),
  }),
  m.edgeUpdate(LAST_CLIP_MS - 1300, "e2", "completed"),
  m.edgeUpdate(LAST_CLIP_MS - 1300, "e3", "completed"),
  m.edgeUpdate(LAST_CLIP_MS - 1200, "e4", "completed"),
  m.edgeUpdate(LAST_CLIP_MS + 100, "e5", "completed"),
  m.nodeUpdate(LAST_CLIP_MS + 200, "collect", "Collect", COLLECT, "completed", {
    output: SHOT_LIST.map((s) => s.clip),
  }),
  m.edgeUpdate(LAST_CLIP_MS + 300, "e6", "active"),

  m.nodeUpdate(LAST_CLIP_MS + 500, "cut", "Add Clips", ADD_CLIPS, "running"),
  m.nodeUpdate(LAST_CLIP_MS + 1000, "cut", "Add Clips", ADD_CLIPS, "completed"),
  m.edgeUpdate(LAST_CLIP_MS + 1100, "e6", "completed"),
  m.edgeUpdate(LAST_CLIP_MS + 1200, "e7", "active"),

  m.nodeUpdate(LAST_CLIP_MS + 1400, "render", "Render Timeline", RENDER, "running"),
  ...m.progress("render", 36, LAST_CLIP_MS + 1500, 1200),
  m.nodeUpdate(LAST_CLIP_MS + 2800, "render", "Render Timeline", RENDER, "completed", {
    output: CUT,
  }),
  m.edgeUpdate(LAST_CLIP_MS + 2900, "e7", "completed"),
  m.jobUpdate(LAST_CLIP_MS + 3000, "completed", { outputs: { film: CUT } }),
];
// The shots overlap, so their events interleave with the stages around them.
events.sort((a, b) => a.t - b.t);

export const shotFanOutCast: DemoCast = {
  version: CAST_VERSION,
  id: "cookbook-shot-fan-out",
  name: "Shot Fan-Out",
  description: "A brief becomes a screenplay, one still and one clip per shot, and a cut.",
  createdAt: new Date(0).toISOString(),
  durationMs: LAST_CLIP_MS + 9000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Shot Fan-Out",
    "Brief → Director → Screenplay Shots → Text To Image → Image To Video → Collect → Add Clips → Render Timeline.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [DIRECTOR]: {
      ...textAgentMeta(DIRECTOR, "Director", [prop("brief", "str")], ["brief"]),
      outputs: [out("screenplay", "str"), out("chunk", "chunk", true)],
    },
    [SHOTS]: meta({
      node_type: SHOTS,
      title: "Screenplay Shots",
      properties: [prop("screenplay", "dict")],
      outputs: [out("shot_prompt", "str", true), out("index", "int", true), out("output", "list")],
      input_fields: ["screenplay"],
      is_streaming_output: true,
    }),
    [TEXT_TO_IMAGE]: imageNodeMeta(TEXT_TO_IMAGE, "Text To Image"),
    [IMAGE_TO_VIDEO]: videoNodeMeta(IMAGE_TO_VIDEO, "Image To Video", [
      prop("image", "image"),
      prop("prompt", "str"),
    ]),
    [COLLECT]: simpleMeta(COLLECT, "Collect", "list", {
      inputs: ["input_item"],
      properties: [prop("input_item", "any")],
    }),
    [ADD_CLIPS]: simpleMeta(ADD_CLIPS, "Add Clips To Timeline", "timeline", {
      inputs: ["clips"],
      inline: ["name"],
      properties: [prop("clips", "list"), prop("name", "str")],
    }),
    [RENDER]: videoNodeMeta(RENDER, "Render Timeline", [prop("timeline", "timeline")]),
  },
  events,
  assets: castAssets([
    "still-1.jpg",
    "still-2.jpg",
    "still-3.jpg",
    "clip-1.webm",
    "clip-2.webm",
    "clip-3.webm",
    "cut.webm",
  ]),
  viewport: fitViewport(nodes),
};
