import { z } from "zod";
import { finite, positive, id, layerBits } from "./common.js";
import { gameVector3, gameQuaternion3D } from "./transform.js";

const colliderSettings = {
  offset: gameVector3.default({ x: 0, y: 0, z: 0 }), rotation: gameQuaternion3D.default([0, 0, 0, 1]),
  sensor: z.boolean().default(false),
  layer: id.optional().describe("Name from the document's collisionLayers. When set, category and mask are derived from the layer's bit and collisionMatrix, so leave them at their defaults."),
  category: layerBits.default(1).describe("Raw membership bits. An advanced override used only when layer is unset."),
  mask: layerBits.default(0xffff).describe("Raw filter bits. An advanced override used only when layer is unset."),
  friction: finite.min(0).max(4).default(0.5), restitution: finite.min(0).max(1).default(0)
};

export const gameCollider3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("box"), halfExtents: z.strictObject({ x: positive, y: positive, z: positive }), ...colliderSettings }),
  z.strictObject({ kind: z.literal("sphere"), radius: positive, ...colliderSettings }),
  z.strictObject({ kind: z.literal("capsule"), radius: positive, halfHeight: positive, ...colliderSettings }),
  z.strictObject({ kind: z.literal("convexHull"), assetId: id, ...colliderSettings }),
  z.strictObject({ kind: z.literal("triangleMesh"), assetId: id, ...colliderSettings })
]);

export type GameCollider3D = z.infer<typeof gameCollider3D>;
