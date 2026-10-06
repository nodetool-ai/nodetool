import { z } from "zod";
import { finite, positive } from "./common.js";
import { gameVector3 } from "./transform.js";

const bodySettings = {
  velocity: gameVector3.default({ x: 0, y: 0, z: 0 }),
  angularVelocity: gameVector3.default({ x: 0, y: 0, z: 0 }),
  gravityScale: finite.default(1), linearDamping: finite.min(0).default(0),
  angularDamping: finite.min(0).default(0), ccd: z.boolean().default(false)
};

export const gameBody3D = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("static"), ...bodySettings }),
  z.strictObject({ type: z.literal("kinematic"), ...bodySettings }),
  z.strictObject({ type: z.literal("dynamic"), ...bodySettings, mass: positive.default(1) })
]);

export type GameBody3D = z.infer<typeof gameBody3D>;
