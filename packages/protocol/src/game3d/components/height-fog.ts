import { z } from "zod";
import { color, finite } from "./common.js";

export const gameHeightFog3D = z.strictObject({
  kind: z.literal("height"), color,
  density: finite.min(0.000001).max(10).default(0.02)
    .describe("Extinction per world unit at baseHeight."),
  baseHeight: finite.min(-10000).max(10000).default(0),
  heightFalloff: finite.min(0.000001).max(100).default(0.2)
    .describe("Exponential density reduction per world unit above baseHeight."),
  maxOpacity: finite.min(0).max(1).default(1)
}).describe("Height-dependent exponential fog integrated along the camera ray. Replaces linear fog.");

export type GameHeightFog3D = z.infer<typeof gameHeightFog3D>;
