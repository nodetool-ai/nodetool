import { z } from "zod";
import { finite } from "./common.js";

export const gameMusicComponent = z.strictObject({ assetId: z.string().min(1), volume: finite.min(0).max(1).default(1), fadeInTicks: z.number().int().min(0).max(600).default(0), fadeOutTicks: z.number().int().min(0).max(600).default(0) }).optional();
