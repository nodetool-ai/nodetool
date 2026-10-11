import { z } from "zod";
import { finite, positive } from "./common.js";

/** Most point and spot lights that render shadows in one frame. Later lights in scene order render without them. */
export const GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D = 4;

export const gameLightShadowFields3D = {
  shadowBias: finite.min(-0.01).max(0.01).optional()
    .describe("Depth offset for this light's shadow map. Small negative values such as -0.0005 remove shadow acne. Defaults to 0."),
  shadowNormalBias: finite.min(0).max(1).optional()
    .describe("World-unit offset along the surface normal before the shadow lookup. Values such as 0.02 remove acne on slopes. Defaults to 0.")
};

export const gameShadowCascades3D = z.strictObject({
  count: z.number().int().min(2).max(4).default(3).describe("Number of shadow maps the directional light splits the view into."),
  split: finite.min(0).max(1).default(0.5)
    .describe("Blend between even splits (0) and logarithmic splits (1). Higher values give nearby cascades more resolution."),
  maxDistance: positive.max(5000).default(200).describe("Camera distance in meters that directional shadows cover.")
}).describe("Cascaded shadow maps for the shadow-casting directional light. Replaces the single map sized by extent.");

export type GameShadowCascades3D = z.infer<typeof gameShadowCascades3D>;

export const gameShadowSettings3D = z.strictObject({
  enabled: z.boolean(), mapSize: z.union([z.literal(512), z.literal(1024), z.literal(2048)]), extent: positive,
  cascades: gameShadowCascades3D.optional()
});

export type GameShadowSettings3D = z.infer<typeof gameShadowSettings3D>;
