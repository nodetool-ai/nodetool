import { z } from "zod";
import { id } from "./common.js";
import { gameMaterial3D } from "./material.js";

export const gameModel3D = z.strictObject({
  assetId: id, nodeId: id.optional(), castShadow: z.boolean().default(true), receiveShadow: z.boolean().default(true),
  material: gameMaterial3D.partial().optional()
});

export type GameModel3D = z.infer<typeof gameModel3D>;
