import { z } from "zod";
import { finite } from "./common.js";

export const gameAudioSourceComponent = z.strictObject({ assetId: z.string().min(1), onEvent: z.string().min(1), volume: finite.min(0).max(1).default(1) }).optional();
