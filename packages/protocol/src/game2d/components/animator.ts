import { z } from "zod";
import { frame } from "./common.js";

const animationClip = z.strictObject({ frames: z.array(frame).min(1), ticksPerFrame: z.number().int().positive(), loop: z.boolean().default(true) });

export const gameAnimatorComponent = z.strictObject({ frames: z.array(frame).min(1), ticksPerFrame: z.number().int().positive(), loop: z.boolean().default(true),
    clips: z.record(z.string().min(1), animationClip).optional() }).optional();
