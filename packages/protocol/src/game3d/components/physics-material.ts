import { z } from "zod";
import { finite, id } from "./common.js";

/** The most physics materials a 3D document declares. */
export const GAME_MAX_PHYSICS_MATERIALS_3D = 64;

/**
 * How two touching colliders combine their friction or restitution. The names match
 * Rapier's coefficient combine rules. When the two colliders use different rules, the
 * one later in this list wins: average, min, multiply, max.
 */
export const gameCombineRule3D = z.enum(["average", "min", "multiply", "max"]);

export type GameCombineRule3D = z.infer<typeof gameCombineRule3D>;

export const gamePhysicsMaterial3D = z.strictObject({
  friction: finite.min(0).max(4).default(0.5),
  restitution: finite.min(0).max(1).default(0),
  frictionCombine: gameCombineRule3D.default("average"),
  restitutionCombine: gameCombineRule3D.default("average")
}).describe("Surface response shared by colliders that name it in physicsMaterial.");

export type GamePhysicsMaterial3D = z.infer<typeof gamePhysicsMaterial3D>;

export const gamePhysicsMaterials3D = z.record(id, gamePhysicsMaterial3D)
  .refine((materials) => Object.keys(materials).length <= GAME_MAX_PHYSICS_MATERIALS_3D, { message: `At most ${GAME_MAX_PHYSICS_MATERIALS_3D} physics materials` })
  .describe("Named physics materials. A collider names one in physicsMaterial instead of setting friction and restitution inline.");

export type GamePhysicsMaterials3D = z.infer<typeof gamePhysicsMaterials3D>;
