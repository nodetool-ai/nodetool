import { z } from "zod";
import { isObjectLike, isRecord } from "./predicates.js";

/** Serialized size limit of one save's data object. */
export const MAX_GAME_SAVE_DATA_BYTES = 16 * 1024;
/** Object keys in one save's data, counted at every depth. */
export const MAX_GAME_SAVE_KEYS = 256;
/** Nesting depth of one save's data. The data object itself is depth 1. */
export const MAX_GAME_SAVE_DEPTH = 16;
/** Slots per scope and game. Writing a new slot beyond this fails. */
export const MAX_GAME_SAVE_SLOTS = 16;
/** Serialized size limit of the optional full snapshot stored with a progress save. */
export const MAX_GAME_SAVE_SNAPSHOT_BYTES = 4 * 1024 * 1024;
/** Save and load commands accepted from all scripts in one tick. More fail the tick. */
export const MAX_GAME_SAVE_REQUESTS_PER_TICK = 4;
/** Load results delivered on one input frame. Later results wait for the next frame. */
export const MAX_GAME_SAVE_LOADS_PER_FRAME = 2;

const encoder = new TextEncoder();
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Progress saves hold game state and may carry a full snapshot. Settings saves hold player preferences only. */
export const gameSaveScope = z.enum(["progress", "settings"]);
export type GameSaveScope = z.infer<typeof gameSaveScope>;

export const gameSaveSlot = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, "Save slot must be 1 to 32 letters, digits, _ or -");

function checkSaveJson(value: unknown, context: z.core.$RefinementCtx): boolean {
  if (!isRecord(value)) {
    context.addIssue({ code: "custom", message: "Save data must be a JSON object" });
    return false;
  }
  let keys = 0;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item || !isObjectLike(item.value)) { continue; }
    if (item.depth > MAX_GAME_SAVE_DEPTH) {
      context.addIssue({ code: "custom", message: `Save data exceeds JSON depth ${MAX_GAME_SAVE_DEPTH}` });
      return false;
    }
    if (Array.isArray(item.value)) {
      for (const child of item.value) { pending.push({ value: child, depth: item.depth + 1 }); }
      continue;
    }
    const prototype = Object.getPrototypeOf(item.value);
    if (prototype !== Object.prototype && prototype !== null) {
      context.addIssue({ code: "custom", message: "Save data must contain only plain JSON objects" });
      return false;
    }
    for (const [key, child] of Object.entries(item.value)) {
      keys += 1;
      if (FORBIDDEN_KEYS.has(key)) {
        context.addIssue({ code: "custom", message: `Save data key ${key} is not allowed` });
        return false;
      }
      pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  if (keys > MAX_GAME_SAVE_KEYS) {
    context.addIssue({ code: "custom", message: `Save data exceeds ${MAX_GAME_SAVE_KEYS} keys (${keys})` });
    return false;
  }
  return true;
}

/** A JSON object of at most 16 KiB, 256 keys at every depth and depth 16. Only JSON values pass. */
export const gameSaveData = z.preprocess((value, context) => checkSaveJson(value, context) ? value : z.NEVER,
  z.record(z.string(), z.json())).superRefine((value, context) => {
  const bytes = encoder.encode(JSON.stringify(value)).byteLength;
  if (bytes > MAX_GAME_SAVE_DATA_BYTES) {
    context.addIssue({ code: "custom", message: `Save data exceeds ${MAX_GAME_SAVE_DATA_BYTES} bytes (${bytes})` });
  }
}).nonoptional();

export type GameSaveData = z.infer<typeof gameSaveData>;

/**
 * Script command that asks the host to write a save after the tick. `scope` defaults to progress. `snapshot`
 * stores the end-of-tick session snapshot with a progress save. The runner removes it from the call's commands,
 * so it never reaches the simulation or counts against `maxCommands`.
 */
export const gameSaveCommand = z.strictObject({
  kind: z.literal("save"), slot: gameSaveSlot, data: gameSaveData, scope: gameSaveScope.optional(), snapshot: z.boolean().optional()
});

export type GameSaveCommand = z.infer<typeof gameSaveCommand>;

/** Script command that asks the host to read a save. The result arrives on a later tick's `input.loaded`. */
export const gameLoadCommand = z.strictObject({ kind: z.literal("load"), slot: gameSaveSlot, scope: gameSaveScope.optional() });

export type GameLoadCommand = z.infer<typeof gameLoadCommand>;

/**
 * A finished load, carried on an input frame. Recording it with the frame lets a replay reproduce the load
 * without touching storage. `data` is null when the slot is empty or its stored data is invalid.
 */
export const gameSaveLoaded = z.strictObject({ scope: gameSaveScope, slot: gameSaveSlot, data: gameSaveData.nullable() });

export type GameSaveLoaded = z.infer<typeof gameSaveLoaded>;

export const gameSaveLoadedFrame = z.array(gameSaveLoaded).max(MAX_GAME_SAVE_LOADS_PER_FRAME);
