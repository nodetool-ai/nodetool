import { z } from "zod";
import { finite, positive } from "./common.js";

export const gameVector3 = z.strictObject({ x: finite, y: finite, z: finite });

export type GameVector3 = z.infer<typeof gameVector3>;

export const gameQuaternion3D = z.tuple([finite, finite, finite, finite]).refine(
  (value) => Math.abs(value.reduce((sum, component) => sum + component * component, 0) - 1) <= 0.00001,
  "Quaternion must be normalized"
);

export type GameQuaternion3D = z.infer<typeof gameQuaternion3D>;

export const gameTransform3D = z.strictObject({
  position: gameVector3.default({ x: 0, y: 0, z: 0 }),
  rotation: gameQuaternion3D.default([0, 0, 0, 1]),
  scale: z.strictObject({ x: positive, y: positive, z: positive }).default({ x: 1, y: 1, z: 1 })
});

export type GameTransform3D = z.infer<typeof gameTransform3D>;
