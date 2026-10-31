import { DatabaseSync } from "node:sqlite";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { gameSaveScope, gameSaveSlot, MAX_GAME_SAVE_SLOTS } from "@nodetool-ai/protocol";
import { nativeJsonSaveRecord, type NativeJsonSaveStorage, type NativeSaveScope } from "@nodetool-ai/protocol/native-game";

/** Per-game storage with atomic replacement and a cross-process scope lock. */
export function createNativeAtomicFileSaveStorage(options: { readonly root: string; readonly gameId: string; readonly engineContract: string }): NativeJsonSaveStorage {
  if (!options.gameId || !options.engineContract) { throw new Error("Native saves require a full game ID and engine contract"); }
  const namespace = createHash("sha256").update(JSON.stringify([options.gameId, options.engineContract])).digest("hex");
  const directory = (scope: NativeSaveScope): string => join(options.root, namespace, gameSaveScope.parse(scope));
  const path = (scope: NativeSaveScope, slot: string): string => join(directory(scope), `${gameSaveSlot.parse(slot)}.json`);
  return {
    persistence: "durable",
    async read(scope, slot) {
      let file;
      try { file = await open(path(scope, slot), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") { return null; } throw error; }
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 17 * 1024) { throw new Error("Native JSON save record exceeds file limit"); }
        const buffer = Buffer.alloc(17 * 1024 + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > 17 * 1024) { throw new Error("Native JSON save grew beyond file limit"); }
        return nativeJsonSaveRecord.parse(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
      } finally { await file.close(); }
    },
    async write(scope, slot, record) {
      const parsed = nativeJsonSaveRecord.parse(record), target = path(scope, slot), folder = directory(scope);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      // SQLite holds an OS-released lock, so a killed writer cannot strand ownership.
      // Keep the database file: unlinking a lock inode would split concurrent writers.
      const lock = new DatabaseSync(join(folder, ".write-lock.sqlite"));
      let locked = false;
      const temporary = join(folder, `.${randomUUID()}.tmp`);
      try {
        lock.exec("BEGIN IMMEDIATE");
        locked = true;
        const slots = (await readdir(folder)).filter((name) => /^[A-Za-z0-9_-]{1,32}\.json$/.test(name));
        if (!slots.includes(`${slot}.json`) && slots.length >= MAX_GAME_SAVE_SLOTS) { throw new Error("Native save slot limit reached"); }
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify(parsed)); await file.sync(); } finally { await file.close(); }
        await rename(temporary, target);
        const parent = await open(folder, constants.O_RDONLY);
        try { await parent.sync(); } finally { await parent.close(); }
      } finally {
        try { await rm(temporary, { force: true }); } finally {
          try { if (locked) { lock.exec("ROLLBACK"); } } finally { lock.close(); }
        }
      }
    }
  };
}
