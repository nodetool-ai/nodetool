import { z } from "zod";
import { positive } from "./common.js";
import { gameScriptParams, gameScriptParamValues, refineGameScriptParams } from "../../game-script-params.js";

export const gameBehavior = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("movement"), speed: positive, left: z.string(), right: z.string(), up: z.string(), down: z.string() }),
  z.strictObject({ kind: z.literal("patrol"), speed: positive, distance: positive, axis: z.enum(["x", "y"]), turnAtLedges: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("collectible"), score: z.number().int().positive().default(1) }),
  z.strictObject({ kind: z.literal("health"), maximum: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("trigger"), event: z.string().min(1) }),
  z.strictObject({ kind: z.literal("spawn"), prefabId: z.string().min(1), onEvent: z.string().min(1) }),
  z.strictObject({ kind: z.literal("sceneTransition"), sceneId: z.string().min(1), onEvent: z.string().min(1) }),
  z.strictObject({ kind: z.literal("winWhenCollected"), count: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("lifetime"), ticks: z.number().int().positive(), fade: z.boolean().default(true), endScale: positive.default(1) }),
  z.strictObject({ kind: z.literal("script"), source: z.string().min(1).max(16_384), maxCommands: z.number().int().min(1).max(64).default(16), maxTickMs: z.number().int().min(1).max(50).default(8),
    /** Inspector-editable parameters. Scripts read their values on `input.params`. */
    params: gameScriptParams.optional(), values: gameScriptParamValues.optional() }).superRefine(refineGameScriptParams)
]);

export type GameBehavior = z.infer<typeof gameBehavior>;
