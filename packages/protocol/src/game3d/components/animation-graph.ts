import { z } from "zod";
import { finite, id, tick } from "./common.js";

const MAX_GRAPH_PARAMETERS = 64;
const MAX_LAYER_STATES = 64;

function boundedRecord<Schema extends z.ZodType>(value: Schema, maximum: number) {
  return z.record(id, value).refine((record) => Object.keys(record).length <= maximum, { message: `At most ${maximum} entries are allowed` });
}

/** Graph parameters are simulation state: scripts set them with `setAnimParam` and transitions read them. */
export const gameAnimationParameter3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("float"), default: finite.min(-1e6).max(1e6).default(0) }),
  z.strictObject({ kind: z.literal("bool"), default: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("trigger") })
]);

export type GameAnimationParameter3D = z.infer<typeof gameAnimationParameter3D>;

/** Clip names are aliases from the entity's `animator3d.clips`, so one graph can drive several models. */
export const gameAnimationMotion3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("clip"), clip: id }),
  z.strictObject({ kind: z.literal("blend1d"), parameter: id,
    points: z.array(z.strictObject({ value: finite.min(-1e6).max(1e6), clip: id })).min(2).max(16) }),
  z.strictObject({ kind: z.literal("blend2d"), parameterX: id, parameterY: id,
    points: z.array(z.strictObject({ x: finite.min(-1e6).max(1e6), y: finite.min(-1e6).max(1e6), clip: id })).min(3).max(16) })
]);

export type GameAnimationMotion3D = z.infer<typeof gameAnimationMotion3D>;

/** One state in a layer. `speed` multiplies the animator's playback rate. */
export const gameAnimationGraphNode3D = z.strictObject({
  motion: gameAnimationMotion3D, speed: finite.min(0).max(8).default(1), loop: z.boolean().default(true)
});

export type GameAnimationGraphNode3D = z.infer<typeof gameAnimationGraphNode3D>;

/** `gt`..`neq` compare a float, `true` and `false` test a bool, and `set` fires on a trigger and consumes it. */
export const gameAnimationCondition3D = z.strictObject({
  parameter: id, op: z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "true", "false", "set"]), value: finite.min(-1e6).max(1e6).optional()
});

export type GameAnimationCondition3D = z.infer<typeof gameAnimationCondition3D>;

/** `from: "*"` is an any-state transition. `exitTicks` is how long the source state must have run before the transition may fire. */
export const gameAnimationTransition3D = z.strictObject({
  from: id, to: id, conditions: z.array(gameAnimationCondition3D).max(8).default([]),
  exitTicks: tick.max(36_000).optional(), durationTicks: tick.max(600).default(6)
});

export type GameAnimationTransition3D = z.infer<typeof gameAnimationTransition3D>;

/** A mask lists prepared model node IDs. Each listed node and its descendants belong to the layer. */
export const gameAnimationLayer3D = z.strictObject({
  id, mode: z.enum(["override", "additive"]).default("override"), weight: finite.min(0).max(1).default(1),
  mask: z.array(id).min(1).max(256).optional(), initialState: id,
  states: boundedRecord(gameAnimationGraphNode3D, MAX_LAYER_STATES),
  transitions: z.array(gameAnimationTransition3D).max(256).default([])
});

export type GameAnimationLayer3D = z.infer<typeof gameAnimationLayer3D>;

export const gameAnimationGraph3D = z.strictObject({
  parameters: boundedRecord(gameAnimationParameter3D, MAX_GRAPH_PARAMETERS).default({}),
  layers: z.array(gameAnimationLayer3D).min(1).max(8)
});

export type GameAnimationGraph3D = z.infer<typeof gameAnimationGraph3D>;

export const gameAnimationGraphs3D = boundedRecord(gameAnimationGraph3D, 64);

/** Per-entity graph state stored in 3D snapshots. Transition progress is derived from `enteredTick` and `transitionTicks`. */
export const gameAnimationGraphRuntime3D = z.strictObject({
  graphId: id,
  parameters: z.record(id, z.union([finite, z.boolean()])),
  layers: z.array(z.strictObject({
    state: id, enteredTick: tick, previousState: id.optional(), previousEnteredTick: tick.optional(), transitionTicks: tick.max(600).optional()
  })).max(8)
});

export type GameAnimationGraphRuntime3D = z.infer<typeof gameAnimationGraphRuntime3D>;

const gameAnimationMotionSample3D = z.strictObject({
  startTick: tick, rate: finite.min(0).max(64), loop: z.boolean(),
  clips: z.array(z.strictObject({ clipId: id, weight: finite.min(0).max(1) })).min(1).max(16)
});

/** Render-frame pose request resolved from graph state. The renderer samples it at the interpolated tick. */
export const gameAnimationPose3D = z.strictObject({
  layers: z.array(z.strictObject({
    mode: z.enum(["override", "additive"]), weight: finite.min(0).max(1), mask: z.array(id).max(256).optional(),
    current: gameAnimationMotionSample3D, previous: gameAnimationMotionSample3D.optional(), transitionTicks: tick.max(600).optional()
  })).max(8)
});

export type GameAnimationPose3D = z.infer<typeof gameAnimationPose3D>;
