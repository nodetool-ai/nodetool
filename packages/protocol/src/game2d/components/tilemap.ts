import { z } from "zod";
import { finite, positive, uint32, frame } from "./common.js";

export const gameTilemapComponent = z.strictObject({ assetId: z.string().min(1),
    tiles: z.array(z.strictObject({ x: finite, y: finite, width: positive, height: positive, frame: frame.optional(), solid: z.boolean().optional(), oneWay: z.boolean().optional() })),
    layer: z.number().int().default(0), solid: z.boolean().optional(), category: uint32.optional(), mask: uint32.optional() }).optional();
