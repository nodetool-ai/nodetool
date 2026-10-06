import { z } from "zod";
import { gameBehavior } from "../../game.js";

// Reuse exactly the nonspatial behavior schemas accepted by legacy revisions.
export const gameNonSpatialBehavior = z.discriminatedUnion("kind", [
  gameBehavior.options[2], gameBehavior.options[3], gameBehavior.options[4], gameBehavior.options[5],
  gameBehavior.options[6], gameBehavior.options[7], gameBehavior.options[8], gameBehavior.options[9]
]);

export type GameNonSpatialBehavior = z.infer<typeof gameNonSpatialBehavior>;

export const gameBehavior3D = gameNonSpatialBehavior;

export type GameBehavior3D = GameNonSpatialBehavior;
