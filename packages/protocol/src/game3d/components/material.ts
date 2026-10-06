import { z } from "zod";
import { finite, color } from "./common.js";

export const gameMaterial3D = z.strictObject({
  color: color.default("#ffffff"), metalness: finite.min(0).max(1).default(0),
  roughness: finite.min(0).max(1).default(0.8), opacity: finite.min(0).max(1).default(1),
  emissive: color.optional(), alphaMode: z.enum(["opaque", "mask", "blend"]).default("opaque"),
  alphaCutoff: finite.min(0).max(1).default(0.5)
});
