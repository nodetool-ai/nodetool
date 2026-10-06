import { z } from "zod";
import { positive } from "./common.js";
import { gameMaterial3D } from "./material.js";

export const gamePrimitive3D = z.strictObject({
  kind: z.enum(["box", "sphere", "capsule", "plane"]),
  dimensions: z.strictObject({ x: positive, y: positive, z: positive }),
  material: gameMaterial3D.default({ color: "#ffffff", metalness: 0, roughness: 0.8, opacity: 1, alphaMode: "opaque", alphaCutoff: 0.5 }),
  castShadow: z.boolean().default(true), receiveShadow: z.boolean().default(true)
});

export type GamePrimitive3D = z.infer<typeof gamePrimitive3D>;
