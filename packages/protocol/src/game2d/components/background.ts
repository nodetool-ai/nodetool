import { z } from "zod";
import { finite, positive, vec2, frame } from "./common.js";

export const gameBackgroundLayer = z.strictObject({
  id: z.string().min(1), assetId: z.string().min(1), width: positive, height: positive,
  layer: z.number().int().default(-100), origin: vec2.default({ x: 0, y: 0 }),
  parallax: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1) }).default({ x: 1, y: 1 }),
  scrollRate: vec2.default({ x: 0, y: 0 }), mode: z.enum(["none", "repeat", "repeatX", "mirror"]).default("repeat"),
  frame: frame.optional(), sampling: z.enum(["nearest", "linear"]).optional()
});

export type GameBackgroundLayer = z.infer<typeof gameBackgroundLayer>;
