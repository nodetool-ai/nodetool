import { z } from "zod";
import { finite, id, tick } from "./common.js";

export const gameAnimator3D = z.strictObject({
  clips: z.record(id, id), initialClip: id.optional(), playbackRate: finite.min(0).max(8).default(1),
  loop: z.boolean().default(true), transitionTicks: tick.max(600).default(6),
  graph: id.optional().describe("Document animationGraphs key. When set, the graph owns playback and playAnimation selects a base-layer state.")
});
