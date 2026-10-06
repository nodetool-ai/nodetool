import { z } from "zod";
import { finite, positive, color } from "./common.js";

export const gameLight3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("directional"), color, intensity: finite.min(0).max(100), castShadow: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("point"), color, intensity: finite.min(0).max(100), range: positive, decay: finite.min(0).max(4).default(2) }),
  z.strictObject({ kind: z.literal("spot"), color, intensity: finite.min(0).max(100), range: positive,
    angle: positive.max(Math.PI / 2), penumbra: finite.min(0).max(1).default(0), decay: finite.min(0).max(4).default(2) })
]);

export type GameLight3D = z.infer<typeof gameLight3D>;
