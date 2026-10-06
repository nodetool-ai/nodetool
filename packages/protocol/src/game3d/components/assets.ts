import { z } from "zod";
import { positive, id, tick } from "./common.js";
import { gameVector3 } from "./transform.js";
import { gameAssetBinding } from "../../game.js";

const bounds = z.strictObject({ min: gameVector3, max: gameVector3 });

export const gameModelImportSettings3D = z.strictObject({
  scale: positive, forward: z.enum(["-z", "+z", "+x", "-x"]), origin: z.enum(["preserve", "ground", "centerGround"])
});

export type GameModelImportSettings3D = z.infer<typeof gameModelImportSettings3D>;

const assetIdentity = { assetId: id, digest: id, required: z.boolean().default(true), provenance: z.string().optional() };

export const gameAssetBinding3D = z.discriminatedUnion("mediaKind", [
  z.strictObject({ mediaKind: z.literal("model"), ...assetIdentity, format: z.literal("glb").default("glb"),
    preparationVersion: id.default("1"), bounds, nodeIds: z.array(id).max(4096), clipIds: z.array(id).max(256),
    geometryBytes: tick, textureBytes: tick, triangles: tick, supportedExtensions: z.array(id).default([]),
    importSettings: gameModelImportSettings3D.optional(), sourceDigest: id.optional(), sourceAssetId: id.optional() }),
  z.strictObject({ mediaKind: z.literal("collider"), ...assetIdentity, preparationVersion: id.default("1"),
    shape: z.enum(["convexHull", "triangleMesh"]), bounds, vertices: tick, triangles: tick }),
  z.strictObject({ mediaKind: z.literal("audio"), ...assetIdentity }),
  z.strictObject({ mediaKind: z.literal("font"), ...assetIdentity, fontFormat: z.enum(["ttf", "otf"]) })
]);

export type GameAssetBinding3D = z.infer<typeof gameAssetBinding3D>;

export const anyGameAssetBinding = z.union([gameAssetBinding, gameAssetBinding3D]);

export type AnyGameAssetBinding = z.infer<typeof anyGameAssetBinding>;
