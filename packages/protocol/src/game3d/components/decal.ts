import { z } from "zod";
import { finite, id } from "./common.js";

export const GAME_MAX_DECALS_3D = 32;

const extent = finite.min(0.001).max(1000);

export const gameDecal3D = z.strictObject({
  assetId: id.describe("Prepared image asset slot projected onto the receiver."),
  receiverId: id.describe("Primitive or rigid model entity in this scene that receives the projection."),
  size: z.strictObject({ x: extent, y: extent, z: extent })
    .describe("Projector width, height and depth in local units. The entity transform scales and rotates the box."),
  opacity: finite.min(0).max(1).default(1),
  renderOrder: z.number().int().min(0).max(GAME_MAX_DECALS_3D - 1).default(0)
    .describe("Overlapping decals draw in ascending order, with scene entity order breaking ties.")
}).describe("Presentation-only textured projection onto one explicit rigid receiver. At most 32 decals per scene.");

export type GameDecal3D = z.infer<typeof gameDecal3D>;
