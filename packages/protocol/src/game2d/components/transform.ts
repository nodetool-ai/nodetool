import { z } from "zod";
import { finite, positive } from "./common.js";

export const gameTransform2D = z.strictObject({
  x: finite,
  y: finite,
  rotation: finite.default(0),
  scaleX: positive.default(1),
  scaleY: positive.default(1)
});

export type GameTransform2D = z.infer<typeof gameTransform2D>;
