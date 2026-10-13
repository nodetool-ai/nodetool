import { z } from "zod";

const coordinate = z.number().finite().min(-1e6).max(1e6);
const vector = z.strictObject({ x: coordinate, y: coordinate, z: coordinate });

/** World-space loads accumulated on the script owner for one physics tick. */
export const gameForceScriptCommand3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("addForce"), force: vector }),
  z.strictObject({ kind: z.literal("addTorque"), torque: vector }),
  z.strictObject({ kind: z.literal("addForceAtPoint"), force: vector, point: vector })
]);
