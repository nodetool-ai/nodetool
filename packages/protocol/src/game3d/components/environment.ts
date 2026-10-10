import { z } from "zod";
import { finite, positive, color, id } from "./common.js";

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

export const gamePostProcessing3D = z.strictObject({
  enabled: z.boolean().default(true).describe("Set false to render exactly as without post-processing while keeping the settings."),
  exposure: finite.min(0.03125).max(16).default(1).describe("Linear exposure multiplier applied before tone mapping."),
  toneMapping: z.enum(["aces", "agx", "neutral", "linear"]).default("aces").describe("Curve that maps HDR scene light to the display. linear scales by exposure and clips."),
  bloom: z.strictObject({
    threshold: finite.min(0).max(8).default(0.85).describe("Scene luminance above which pixels bloom. Values above 1 limit bloom to emissive and very bright surfaces."),
    softness: finite.min(0).max(0.5).default(0.1).describe("Width of the transition around the threshold."),
    radius: finite.min(0).max(1).default(0.4).describe("Spread of the glow, from tight (0) to wide (1)."),
    intensity: finite.min(0).max(4).default(1).describe("Strength of the glow added to the image.")
  }).optional().describe("Glow around bright areas, computed on HDR light before tone mapping."),
  vignette: z.strictObject({
    intensity: finite.min(0).max(1).default(0.4).describe("Darkening at the corners. 0 has no effect and 1 reaches black."),
    radius: finite.min(0).max(1).default(0.5).describe("Normalized distance from the center, 0 to the corner 1, where darkening starts."),
    softness: finite.min(0.01).max(1).default(0.5).describe("Distance over which darkening reaches full intensity.")
  }).optional().describe("Darkens the image toward its corners after tone mapping."),
  antialias: z.enum(["msaa", "fxaa", "smaa", "none"]).default("msaa").describe("Edge smoothing. msaa matches rendering without post-processing. fxaa and smaa smooth the final image instead.")
}).describe("Presentation-only image processing. Passes run in a fixed order: bloom, exposure and tone mapping, vignette, then antialiasing.");

export type GamePostProcessing3D = z.infer<typeof gamePostProcessing3D>;

export const gameEnvironment3D = z.strictObject({
  background: color.default("#202838"), ambient: z.strictObject({ color, intensity: finite.min(0).max(4) }).default({ color: "#ffffff", intensity: 0.5 }),
  fog: z.strictObject({ color, near: finite.min(0), far: positive }).optional(),
  shadows: z.strictObject({ enabled: z.boolean(), mapSize: z.union([z.literal(512), z.literal(1024), z.literal(2048)]), extent: positive }).default({ enabled: true, mapSize: 1024, extent: 30 }),
  sky: gameSky3D.optional(),
  postProcessing: gamePostProcessing3D.optional()
});

export type GameEnvironment3D = z.infer<typeof gameEnvironment3D>;
