import { z } from "zod";
import { finite, positive, frame } from "./common.js";

export const gameSpriteComponent = z.strictObject({ assetId: z.string().min(1), width: positive, height: positive, layer: z.number().int().default(0), frame: frame.optional(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional(), blend: z.enum(["normal", "additive"]).optional(), unlit: z.boolean().optional(), flipX: z.boolean().optional(),
    // The direction the art faces. The sprite then turns to face the body's horizontal motion.
    faceMotion: z.enum(["left", "right"]).optional() }).optional();
