import { z } from "zod";
import { positive } from "./common.js";

export const gameCamera2dComponent = z.strictObject({ zoom: positive.default(1), width: positive, height: positive }).optional();
