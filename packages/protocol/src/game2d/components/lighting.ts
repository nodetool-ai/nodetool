import { z } from "zod";
import { finite, positive } from "./common.js";

export const gameLightingComponent = z.strictObject({ required: z.boolean().optional(), ambient: z.strictObject({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), intensity: finite.min(0).max(1) }),
    points: z.array(z.strictObject({ x: finite, y: finite, color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      intensity: finite.min(0).max(4), radius: positive, falloff: finite.min(0.5).max(4) })).max(32) }).optional();
