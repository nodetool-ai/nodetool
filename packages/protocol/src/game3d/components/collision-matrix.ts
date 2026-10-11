import { z } from "zod";
import { id } from "./common.js";

/** Every unordered pair of the sixteen collision layers, a layer paired with itself included. */
export const GAME_MAX_COLLISION_PAIRS_3D = 136;

export const gameCollisionMatrix3D = z.array(z.tuple([id, id])).max(GAME_MAX_COLLISION_PAIRS_3D)
  .describe("Pairs of collisionLayers names that do not collide. Every unlisted pair collides. A pair is unordered, and a layer paired with itself stops colliders on that layer from touching each other.");

export type GameCollisionMatrix3D = z.infer<typeof gameCollisionMatrix3D>;
