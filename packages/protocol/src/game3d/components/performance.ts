import { z } from "zod";
import { id, positive } from "./common.js";

/** The largest camera distance, in world units, that a cull setting accepts. */
export const GAME_MAX_CULL_DISTANCE_3D = 100_000;

/** The most cull layers a document declares. */
export const GAME_MAX_CULL_LAYERS_3D = 32;

const cullDistance = positive.max(GAME_MAX_CULL_DISTANCE_3D)
  .describe("Camera distance in world units beyond which the renderer hides the entity. Presentation only: simulation, physics and scripts still run.");

const cullLayerName = id.max(64);

export const gameRenderCulling3D = z.strictObject({
  layer: cullLayerName.optional().describe("Cull layer declared in the document's performance.cullLayers. Its maxDistance applies when the entity sets none."),
  maxDistance: cullDistance.optional()
}).describe("Render-side distance culling for this entity. It never changes simulation.");

export type GameRenderCulling3D = z.infer<typeof gameRenderCulling3D>;

const budget = (maximum: number) => z.number().int().min(1).max(maximum);

export const gameFrameBudgets = z.strictObject({
  drawCalls: budget(100_000).optional().describe("Draw calls per rendered frame."),
  triangles: budget(100_000_000).optional().describe("Triangles per rendered frame."),
  particles: budget(1_000_000).optional().describe("Live particles in the scene, as the 3D standalone player and 3D capture count them."),
  voices: budget(1024).optional().describe("Playing audio voices."),
  tickMs: z.number().positive().max(1000).optional().describe("Simulation tick p95 in milliseconds, as `nodetool game bench` measures it. Default 4."),
  frameMs: z.number().positive().max(1000).optional().describe("Rendered frame p95 in milliseconds, as `nodetool game perf` measures it in the exported player. Default 16.6.")
}).describe("Per-frame and per-tick budgets. Players warn in the console when a frame exceeds a count budget. `game bench`, `game capture` and `game perf` exit non-zero on an overrun with --fail-on-budget. Omitted budgets use the defaults.");

export type GameFrameBudgets = z.infer<typeof gameFrameBudgets>;

export const gamePerformance3D = z.strictObject({
  cullLayers: z.record(cullLayerName, z.strictObject({ maxDistance: cullDistance }))
    .refine((layers) => Object.keys(layers).length <= GAME_MAX_CULL_LAYERS_3D, { message: `At most ${GAME_MAX_CULL_LAYERS_3D} cull layers` })
    .optional().describe("Named cull layers. Entities pick one with renderCulling.layer."),
  budgets: gameFrameBudgets.optional()
}).describe("Presentation-only performance settings: distance culling layers and frame budgets.");

export type GamePerformance3D = z.infer<typeof gamePerformance3D>;
