import { z } from "zod";
import { finite, positive, id } from "./common.js";
import { gameVector3 } from "./transform.js";

export const gameCameraProjection3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("perspective"), fov: positive.max(179).default(60), near: positive.default(0.1), far: positive.default(1000) }),
  z.strictObject({ kind: z.literal("orthographic"), size: positive.default(10), near: positive.default(0.1), far: positive.default(1000) })
]);

export const gameCamera3D = z.strictObject({
  projection: gameCameraProjection3D,
  behavior: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("fixed") }),
    z.strictObject({ kind: z.literal("follow"), targetId: id, offset: gameVector3.default({ x: 0, y: 2, z: 5 }),
      lookAtOffset: gameVector3.default({ x: 0, y: 1, z: 0 }), yaw: finite.default(0).describe("Initial follow-camera yaw in degrees."),
      pitch: finite.default(0).describe("Initial follow-camera pitch in degrees."),
      minPitch: finite.min(-89).max(89).default(-60).describe("Minimum follow-camera pitch in degrees."),
      maxPitch: finite.min(-89).max(89).default(60).describe("Maximum follow-camera pitch in degrees."),
      sensitivity: positive.default(0.002), collisionRadius: positive.default(0.2) })
  ]).default({ kind: "fixed" })
});

export type GameCamera3D = z.infer<typeof gameCamera3D>;
