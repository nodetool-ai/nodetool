import { z } from "zod";
import { finite, color, id } from "./common.js";

const tilingAxis = finite.min(0.001).max(1024);
const offsetAxis = finite.min(-1024).max(1024);
export const gameTextureSlot3D = z.strictObject({
  assetId: id,
  tiling: z.strictObject({ x: tilingAxis, y: tilingAxis }).optional(),
  offset: z.strictObject({ x: offsetAxis, y: offsetAxis }).optional()
});

export const gameMaterial3D = z.strictObject({
  color: color.default("#ffffff"), metalness: finite.min(0).max(1).default(0),
  roughness: finite.min(0).max(1).default(0.8), opacity: finite.min(0).max(1).default(1),
  emissive: color.optional(), alphaMode: z.enum(["opaque", "mask", "blend"]).default("opaque"),
  alphaCutoff: finite.min(0).max(1).default(0.5),
  baseColorTexture: gameTextureSlot3D.optional(), normalTexture: gameTextureSlot3D.optional(),
  ormTexture: gameTextureSlot3D.optional(), emissiveTexture: gameTextureSlot3D.optional(),
  shading: z.enum(["standard", "toon"]).optional(), toonSteps: z.number().int().min(2).max(8).optional(),
  outline: z.strictObject({ color, width: finite.min(0).max(0.1) }).optional()
});

export type GameMaterial3D = z.infer<typeof gameMaterial3D>;
export type GameTextureSlot3D = z.infer<typeof gameTextureSlot3D>;
