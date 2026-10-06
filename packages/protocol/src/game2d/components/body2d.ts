import { z } from "zod";
import { finite, vec2 } from "./common.js";

export const gameBody2dComponent = z.strictObject({ type: z.enum(["static", "kinematic"]), velocity: vec2.default({ x: 0, y: 0 }), gravityScale: finite.optional() }).optional();
