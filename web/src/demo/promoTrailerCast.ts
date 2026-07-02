/**
 * Promo cast — Act 1 of the landing-page product video (demo/src/promo).
 *
 * One shot brief fans out into four text-to-video nodes — two Seedance, two
 * Wan, all real registry types — and the four takes render in parallel. The
 * clips are real segments cut from `marketing/public/movie_trailer_example.mp4`,
 * pinned under `demo/public/casts/promo/` and referenced through the standard
 * `cast-asset://` manifest, so the same footage reappears on the timeline in
 * Act 2 and the two acts stay visibly continuous.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "./castTypes";
import { castMessages } from "./castHelpers";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  node,
  stringInputMeta,
  videoNodeMeta,
} from "./cookbook/builders";

const STRING_INPUT = "nodetool.input.StringInput";
const SEEDANCE = "fal.text_to_video.BytedanceSeedance20TextToVideo";
const SEEDANCE_FAST = "fal.text_to_video.BytedanceSeedance20FastTextToVideo";
const WAN_26 = "fal.text_to_video.WanV26TextToVideo";
const WAN_25 = "fal.text_to_video.Wan25PreviewTextToVideo";

const WF = "wf-promo-trailer";
const JOB = "promo-trailer-job";
const m = castMessages(WF, JOB);

const BRIEF =
  "Wasteland trailer: rust-armored muscle car drifting through a desert storm, " +
  "sparks, riders in the ruins, monster wheels. Gritty, cinematic, golden hour.";

const takeVideo = (key: string) => ({
  type: "video",
  uri: `cast-asset://${key}`,
  metadata: { format: "webm" },
});

const DRIFT = takeVideo("take-drift");
const WHEEL = takeVideo("take-wheel");
const RIDER = takeVideo("take-rider");
const SPARKS = takeVideo("take-sparks");

/**
 * Layout: brief on the left, the four takes in a 2×2 grid to its right. The
 * promo camera (demo/src/promo) frames the grid for the render/pick beats, so
 * these positions are part of the shot design — move them and re-frame.
 */
const nodes = [
  node("brief", STRING_INPUT, 0, 400, 300, "Shot brief", {
    name: "brief",
    value: BRIEF,
  }),
  node("seedance", SEEDANCE, 480, 40, 320, "Seedance 2.0", { prompt: BRIEF }),
  node("wan26", WAN_26, 880, 40, 320, "Wan 2.6", { prompt: BRIEF }),
  node("seedanceFast", SEEDANCE_FAST, 480, 560, 320, "Seedance 2.0 Fast", {
    prompt: BRIEF,
  }),
  node("wan25", WAN_25, 880, 560, 320, "Wan 2.5 Preview", { prompt: BRIEF }),
];

const edges = [
  edge("e-seedance", "brief", "output", "seedance", "prompt"),
  edge("e-wan26", "brief", "output", "wan26", "prompt"),
  edge("e-seedanceFast", "brief", "output", "seedanceFast", "prompt"),
  edge("e-wan25", "brief", "output", "wan25", "prompt"),
];

// Sorted by `t` below: the four progress ramps interleave with the
// completion events, and the engine's replay scan requires ascending order.
const unsortedEvents: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "brief", "Shot brief", STRING_INPUT, "running"),
  m.nodeUpdate(1000, "brief", "Shot brief", STRING_INPUT, "completed", {
    output: BRIEF,
  }),
  m.edgeUpdate(1200, "e-seedance", "active"),
  m.edgeUpdate(1350, "e-wan26", "active"),
  m.edgeUpdate(1500, "e-seedanceFast", "active"),
  m.edgeUpdate(1650, "e-wan25", "active"),

  // All four generators run in parallel, staggered so the canvas visibly
  // fills up: the Fast variant lands first, the big models take longer.
  m.nodeUpdate(1800, "seedance", "Seedance 2.0", SEEDANCE, "running"),
  m.nodeUpdate(2050, "seedanceFast", "Seedance 2.0 Fast", SEEDANCE_FAST, "running"),
  m.nodeUpdate(2300, "wan26", "Wan 2.6", WAN_26, "running"),
  m.nodeUpdate(2550, "wan25", "Wan 2.5 Preview", WAN_25, "running"),

  ...m.progress("seedanceFast", 12, 2600, 2700),
  ...m.progress("wan25", 14, 2800, 3400),
  ...m.progress("seedance", 16, 3000, 4000),
  ...m.progress("wan26", 16, 3200, 4600),

  m.nodeUpdate(5400, "seedanceFast", "Seedance 2.0 Fast", SEEDANCE_FAST, "completed", {
    output: WHEEL,
  }),
  m.edgeUpdate(5600, "e-seedanceFast", "completed"),

  m.nodeUpdate(6300, "wan25", "Wan 2.5 Preview", WAN_25, "completed", {
    output: SPARKS,
  }),
  m.edgeUpdate(6500, "e-wan25", "completed"),

  m.nodeUpdate(7100, "seedance", "Seedance 2.0", SEEDANCE, "completed", {
    output: DRIFT,
  }),
  m.edgeUpdate(7300, "e-seedance", "completed"),

  m.nodeUpdate(7900, "wan26", "Wan 2.6", WAN_26, "completed", {
    output: RIDER,
  }),
  m.edgeUpdate(8100, "e-wan26", "completed"),

  m.jobUpdate(8400, "completed", {
    outputs: { seedance: DRIFT, seedanceFast: WHEEL, wan26: RIDER, wan25: SPARKS },
  }),
];

const events = [...unsortedEvents].sort((a, b) => a.t - b.t);

export const promoTrailerCast: DemoCast = {
  version: CAST_VERSION,
  id: "promo-trailer",
  name: "Promo — generate trailer takes",
  description:
    "One shot brief fans out into four text-to-video takes (Seedance ×2, Wan ×2).",
  createdAt: new Date(0).toISOString(),
  durationMs: 14000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Trailer takes",
    "Shot brief → Seedance 2.0 + Seedance 2.0 Fast + Wan 2.6 + Wan 2.5, in parallel.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [SEEDANCE]: videoNodeMeta(SEEDANCE, "Seedance 2.0"),
    [SEEDANCE_FAST]: videoNodeMeta(SEEDANCE_FAST, "Seedance 2.0 Fast"),
    [WAN_26]: videoNodeMeta(WAN_26, "Wan 2.6"),
    [WAN_25]: videoNodeMeta(WAN_25, "Wan 2.5 Preview"),
  },
  events,
  assets: [
    { key: "take-drift", file: "take-drift.webm", contentType: "video/webm" },
    { key: "take-wheel", file: "take-wheel.webm", contentType: "video/webm" },
    { key: "take-rider", file: "take-rider.webm", contentType: "video/webm" },
    { key: "take-sparks", file: "take-sparks.webm", contentType: "video/webm" },
  ],
  viewport: fitViewport(nodes, 460),
};
