import { z } from "zod";
import { finite, positive, vec2, hexColor } from "./common.js";

export const gameLight2dComponent = z.strictObject({ color: hexColor, intensity: finite.min(0).max(4), radius: positive, falloff: finite.min(0.5).max(4).default(1),
    offset: vec2.optional() }).optional();
