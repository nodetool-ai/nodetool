import { z } from "zod";
import { finite } from "./common.js";

/** Largest distance, in world units, that spatial audio settings accept. */
export const GAME_AUDIO_MAX_DISTANCE = 100_000;

/** Defaults a spatial emitter uses for settings the author leaves out. */
export const GAME_AUDIO_SPATIAL_DEFAULTS = {
  minDistance: 1, maxDistance: 50, rolloff: 1, distanceModel: "inverse", doppler: 0
} as const;

const distance = finite.positive().max(GAME_AUDIO_MAX_DISTANCE);
const angle = finite.min(0).max(360);

export const gameAudioDistanceModel = z.enum(["linear", "inverse", "exponential"]);

export const gameAudioCone = z.strictObject({
  innerAngle: angle.describe("Full angle in degrees, around the entity's forward axis, inside which the effect plays at full volume."),
  outerAngle: angle.describe("Full angle in degrees outside which the effect plays at outerGain. Must be at least innerAngle."),
  outerGain: finite.min(0).max(1).describe("Gain outside outerAngle.")
}).describe("Directional emitter. 3D entities point along their local -Z axis. 2D entities point toward the camera, so a cone has no effect in 2D.");

export type GameAudioCone = z.infer<typeof gameAudioCone>;

export const gameAudioSourceComponent = z.strictObject({
  assetId: z.string().min(1), onEvent: z.string().min(1), volume: finite.min(0).max(1).default(1),
  spatial: z.boolean().optional().describe("Play the effect at the entity's position: pan and attenuate it relative to the active camera. Default false plays it unpositioned."),
  minDistance: distance.optional().describe("Distance in world units within which the effect plays at full volume. Default 1."),
  maxDistance: distance.optional().describe("Distance in world units beyond which attenuation stops. Default 50. Must be greater than minDistance."),
  rolloff: finite.min(0).max(16).optional().describe("How fast volume falls between minDistance and maxDistance. Default 1. The linear model clamps it to 1."),
  distanceModel: gameAudioDistanceModel.optional().describe("Attenuation curve: linear, inverse (default) or exponential."),
  cone: gameAudioCone.optional(),
  doppler: finite.min(0).max(4).optional().describe("Doppler pitch shift strength from emitter and camera motion. Default 0 turns it off; 1 is physical.")
}).optional();

/** The spatial settings an audio event carries, with defaults applied and the emitter's position when it played. */
export const gameAudioEmitter = z.strictObject({
  entityId: z.string(),
  position: z.strictObject({ x: finite, y: finite, z: finite }),
  minDistance: distance, maxDistance: distance, rolloff: finite.min(0).max(16),
  distanceModel: gameAudioDistanceModel, cone: gameAudioCone.optional(), doppler: finite.min(0).max(4)
});

export type GameAudioEmitter = z.infer<typeof gameAudioEmitter>;

/** Cross-field checks for an audio source that the component schema cannot express. Paths are relative to the component. */
export function gameAudioSourceIssues(source: NonNullable<z.infer<typeof gameAudioSourceComponent>>): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const minDistance = source.minDistance ?? GAME_AUDIO_SPATIAL_DEFAULTS.minDistance;
  const maxDistance = source.maxDistance ?? GAME_AUDIO_SPATIAL_DEFAULTS.maxDistance;
  if (maxDistance <= minDistance) {
    issues.push({ path: [source.maxDistance === undefined ? "minDistance" : "maxDistance"], message: `maxDistance (${maxDistance}) must be greater than minDistance (${minDistance})` });
  }
  if (source.cone && source.cone.outerAngle < source.cone.innerAngle) {
    issues.push({ path: ["cone", "outerAngle"], message: "cone.outerAngle must be at least cone.innerAngle" });
  }
  return issues;
}
