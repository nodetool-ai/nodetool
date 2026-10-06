import { z } from "zod";
import { finite, positive, color } from "./common.js";

export const gameEnvironment3D = z.strictObject({
  background: color.default("#202838"), ambient: z.strictObject({ color, intensity: finite.min(0).max(4) }).default({ color: "#ffffff", intensity: 0.5 }),
  fog: z.strictObject({ color, near: finite.min(0), far: positive }).optional(),
  shadows: z.strictObject({ enabled: z.boolean(), mapSize: z.union([z.literal(512), z.literal(1024), z.literal(2048)]), extent: positive }).default({ enabled: true, mapSize: 1024, extent: 30 })
});

export type GameEnvironment3D = z.infer<typeof gameEnvironment3D>;
