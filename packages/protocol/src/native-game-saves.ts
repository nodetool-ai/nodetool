import { z } from "zod";
import { gameSaveData, gameSaveScope, gameSaveSlot, MAX_GAME_SAVE_LOADS_PER_FRAME } from "./game-saves.js";

export const nativeSaveScope = gameSaveScope;
export type NativeSaveScope = z.infer<typeof nativeSaveScope>;
// Structural schemas are exportable to the C++ validator. The storage seam additionally validates gameSaveData.
export const nativeSaveData = z.record(z.string(), z.json()).superRefine((value, context) => {
  const parsed = gameSaveData.safeParse(value);
  if (!parsed.success) { for (const issue of parsed.error.issues) { context.addIssue({ code: "custom", message: issue.message }); } }
});
export const nativeSaveCommand = z.strictObject({ kind: z.literal("save"), scope: nativeSaveScope.default("progress"), slot: gameSaveSlot, data: nativeSaveData });
export const nativeLoadCommand = z.strictObject({ kind: z.literal("load"), scope: nativeSaveScope.default("progress"), slot: gameSaveSlot });
const identity = { generation: z.number().int().positive(), tick: z.number().int().nonnegative(), sequence: z.number().int().min(0).max(3) };
export const nativeSaveRequest = z.discriminatedUnion("kind", [nativeSaveCommand.extend(identity), nativeLoadCommand.extend(identity)]);
export type NativeSaveRequest = z.infer<typeof nativeSaveRequest>;
export const nativeJsonSaveRecord = z.strictObject({ formatVersion: z.literal(1), data: gameSaveData });
export type NativeJsonSaveRecord = z.infer<typeof nativeJsonSaveRecord>;
export const nativeSaveLoaded = z.strictObject({ scope: nativeSaveScope, slot: gameSaveSlot, data: gameSaveData.nullable() });
export const nativeSaveCompletion = z.strictObject({ ...identity, scope: nativeSaveScope, slot: gameSaveSlot, data: gameSaveData.nullable(), diagnostic: z.string().max(4096).optional() });
export type NativeSaveCompletion = z.infer<typeof nativeSaveCompletion>;
export const nativeSaveLoadedFrame = z.array(nativeSaveLoaded).max(MAX_GAME_SAVE_LOADS_PER_FRAME);
export interface NativeJsonSaveStorage {
  readonly persistence: "memory" | "durable";
  read(scope: NativeSaveScope, slot: string): Promise<NativeJsonSaveRecord | null>;
  write(scope: NativeSaveScope, slot: string, record: NativeJsonSaveRecord): Promise<void>;
}
