import { z } from "zod";
import { finite } from "./common.js";

const streamingMusic = z.strictObject({
  loopStartSeconds: finite.min(0).max(86400).default(0),
  loopEndSeconds: finite.positive().max(86400).optional()
}).refine((settings) => settings.loopEndSeconds === undefined || settings.loopEndSeconds > settings.loopStartSeconds,
  { path: ["loopEndSeconds"], message: "Loop end must be after loop start" });

export const gameMusicComponent = z.strictObject({
  assetId: z.string().min(1),
  volume: finite.min(0).max(1).default(1),
  fadeInTicks: z.number().int().min(0).max(600).default(0),
  fadeOutTicks: z.number().int().min(0).max(600).default(0),
  /** Omitted tracks keep decoded playback. Streaming bypasses full-track decoding. */
  streaming: streamingMusic.optional().describe("Stream the track through the music bus without full-file decoding. Loop points are seconds, and omitted loop end uses the track duration.")
}).optional();
