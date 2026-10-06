import { z } from "zod";
import { positive, uint32 } from "./common.js";

export const gameCollider2dComponent = z.strictObject({ width: positive, height: positive, sensor: z.boolean().default(false),
    category: uint32.default(1), mask: uint32.default(0xffffffff), oneWay: z.boolean().optional() }).optional();
