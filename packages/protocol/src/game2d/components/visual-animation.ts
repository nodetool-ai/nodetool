import { z } from "zod";
import { finite } from "./common.js";

const visualTiming = { durationTicks: z.number().int().min(1).max(36000), delayTicks: z.number().int().min(0).max(36000).default(0), repeat: z.boolean().default(false), pingPong: z.boolean().default(false), easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("linear") };

const numericTrack = (property: "rotation" | "scaleX" | "scaleY" | "opacity") => z.strictObject({ property: z.literal(property), from: finite, to: finite, ...visualTiming });

export const gameVisualTrack = z.discriminatedUnion("property", [
  numericTrack("rotation"), numericTrack("scaleX"), numericTrack("scaleY"), numericTrack("opacity"),
  z.strictObject({ property: z.literal("tint"), from: z.string().regex(/^#[0-9a-fA-F]{6}$/), to: z.string().regex(/^#[0-9a-fA-F]{6}$/), ...visualTiming })
]);

export type GameVisualTrack = z.infer<typeof gameVisualTrack>;

export const gameVisualAnimationComponent = z.strictObject({ tracks: z.array(gameVisualTrack).max(5).default([]), rotationRate: finite.optional() }).optional();
