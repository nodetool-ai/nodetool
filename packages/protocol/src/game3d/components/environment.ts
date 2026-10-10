import { z } from "zod";
import { finite, positive, color, id } from "./common.js";
import { gameShadowSettings3D } from "./shadows.js";

const skyIntensity = finite.min(0).max(8).default(1).describe("Multiplier for the sky background and its image-based lighting.");

export const gameSky3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("color") }).describe("Solid background color with no environment lighting."),
  z.strictObject({ kind: z.literal("hdri"), assetId: id.describe("Asset slot of an hdri binding."),
    rotation: finite.min(-2 * Math.PI).max(2 * Math.PI).default(0).describe("Rotation about +Y in radians."),
    intensity: skyIntensity }).describe("Equirectangular HDR image used as background and environment lighting."),
  z.strictObject({ kind: z.literal("procedural"),
    sunEntityId: id.optional().describe("Directional light entity whose direction places the sun. Defaults to the first directional light."),
    turbidity: finite.min(1).max(20).default(10).describe("Atmospheric haze. Higher values whiten the sky."),
    rayleigh: finite.min(0).max(4).default(2).describe("Rayleigh scattering. Higher values deepen blue and sunset tones."),
    groundColor: color.default("#3d3a36").describe("Color of the lower hemisphere."),
    intensity: skyIntensity }).describe("Physical sky model used as background and environment lighting.")
]);

export type GameSky3D = z.infer<typeof gameSky3D>;

export const gameEnvironment3D = z.strictObject({
  background: color.default("#202838"), ambient: z.strictObject({ color, intensity: finite.min(0).max(4) }).default({ color: "#ffffff", intensity: 0.5 }),
  fog: z.strictObject({ color, near: finite.min(0), far: positive }).optional(),
  shadows: gameShadowSettings3D.default({ enabled: true, mapSize: 1024, extent: 30 }),
  sky: gameSky3D.optional()
});

export type GameEnvironment3D = z.infer<typeof gameEnvironment3D>;
