import { z } from "zod";
import { finite, positive, color } from "./common.js";
import { gameLightShadowFields3D } from "./shadows.js";

const localCastShadow = z.boolean().optional()
  .describe("Render shadows from this light. At most 4 point and spot lights cast shadows per scene.");

export const gameLight3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("directional"), color, intensity: finite.min(0).max(100), castShadow: z.boolean().default(false), ...gameLightShadowFields3D }),
  z.strictObject({ kind: z.literal("point"), color, intensity: finite.min(0).max(100), range: positive, decay: finite.min(0).max(4).default(2),
    castShadow: localCastShadow, ...gameLightShadowFields3D }),
  z.strictObject({ kind: z.literal("spot"), color, intensity: finite.min(0).max(100), range: positive,
    angle: positive.max(Math.PI / 2), penumbra: finite.min(0).max(1).default(0), decay: finite.min(0).max(4).default(2),
    castShadow: localCastShadow, ...gameLightShadowFields3D })
]);

export type GameLight3D = z.infer<typeof gameLight3D>;
