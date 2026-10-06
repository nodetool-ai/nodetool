import { z } from "zod";
import { finite, positive, id, tick } from "./common.js";

export const gameCharacter3D = z.strictObject({
  speed: positive.default(5), acceleration: positive.default(30), jumpSpeed: positive.default(6),
  slopeLimit: finite.min(0).max(89).default(45), stepHeight: finite.min(0).default(0.3),
  groundSnap: finite.min(0).default(0.2), coyoteTicks: tick.max(60).default(6),
  jumpBufferTicks: tick.max(60).default(6), moveXAxis: id.default("moveX"), moveZAxis: id.default("moveZ"),
  jumpAction: id.default("jump")
});

export type GameCharacter3D = z.infer<typeof gameCharacter3D>;
