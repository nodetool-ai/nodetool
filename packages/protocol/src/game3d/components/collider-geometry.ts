import { z } from "zod";
import { finite } from "./common.js";

export const gamePreparedCollider3D = z.strictObject({
  vertices: z.array(finite).min(9).max(750_000), indices: z.array(z.number().int().nonnegative()).max(750_000).optional()
}).superRefine((geometry, context) => {
  if (geometry.vertices.length % 3 !== 0) { context.addIssue({ code: "custom", path: ["vertices"], message: "Vertices must be complete XYZ triples" }); }
  if (geometry.indices && (geometry.indices.length % 3 !== 0 || geometry.indices.some((index) => index >= geometry.vertices.length / 3))) {
    context.addIssue({ code: "custom", path: ["indices"], message: "Triangle indices must be complete triples within vertex bounds" });
  }
});

export type GamePreparedCollider3D = z.infer<typeof gamePreparedCollider3D>;
