import type { GamePlayerSaves, GameSaveRecord, GameSaveStorage } from "@nodetool-ai/game-runtime";
import { MAX_GAME_SAVE_SLOTS, type GameSaveScope } from "@nodetool-ai/protocol";

const DATABASE = "nodetool-game-saves";
const STORE = "saves";

/** One key per game, scope and slot. Scope and slot names cannot contain the separator. */
function saveKey(gameId: string, scope: GameSaveScope, slot: string): string {
  return `${gameId}/${scope}/${slot}`;
}

function slotsUnder(keys: Iterable<string>, gameId: string, scope: GameSaveScope): string[] {
  const prefix = `${gameId}/${scope}/`;
  return [...keys].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)).filter((slot) => !slot.includes("/")).sort();
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Game save storage request failed"));
  });
}

/** IndexedDB storage for the standalone player. Saves outlive the page and stay per game. */
export function createIndexedDbGameSaveStorage(gameId: string, factory?: IDBFactory): GameSaveStorage {
  let opened: Promise<IDBDatabase> | undefined;
  const database = (): Promise<IDBDatabase> => {
    if (opened) { return opened; }
    const pending = Promise.resolve().then(() => new Promise<IDBDatabase>((resolve, reject) => {
      const storage = factory ?? globalThis.indexedDB;
      if (!storage) { throw new Error("IndexedDB is not available"); }
      const request = storage.open(DATABASE, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB could not open"));
    })).catch((cause: unknown) => {
      throw new Error("Game save storage is unavailable", { cause });
    });
    opened = pending;
    void pending.catch(() => { if (opened === pending) { opened = undefined; } });
    return pending;
  };
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const transaction = (await database()).transaction(STORE, mode);
    const result = settle(action(transaction.objectStore(STORE)));
    if (mode === "readonly") { return result; }
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Game save storage write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Game save storage write was aborted"));
    });
    // Await both, so a failed request and the aborted transaction it causes reject once, with no unhandled rejection.
    const [value] = await Promise.all([result, completed]);
    return value;
  };
  return {
    read: (scope, slot) => run("readonly", (store) => store.get(saveKey(gameId, scope, slot))),
    write: async (scope, slot, record, options) => {
      if (!options) { await run("readwrite", store => store.put(record, saveKey(gameId, scope, slot))); return; }
      const transaction = (await database()).transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      let written = false;
      let failure: Error | undefined;
      const completed = new Promise<boolean>((resolve, reject) => {
        transaction.oncomplete = () => failure ? reject(failure) : resolve(written);
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Game save write failed"));
      });
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const slots = slotsUnder(request.result.filter((key): key is string => typeof key === "string"), gameId, scope);
        if (options.onlyIfEmpty && slots.includes(slot)) { return; }
        if (!slots.includes(slot) && slots.length >= (options.maxSlots ?? MAX_GAME_SAVE_SLOTS)) {
          failure = new Error("Game save slot limit reached");
          return;
        }
        store.put(record, saveKey(gameId, scope, slot));
        written = true;
      };
      return completed;
    },
    remove: async (scope, slot) => { await run("readwrite", (store) => store.delete(saveKey(gameId, scope, slot))); },
    slots: async (scope) => slotsUnder((await run("readonly", (store) => store.getAllKeys())).filter((key): key is string => typeof key === "string"), gameId, scope)
  };
}

/** The parts of `Storage` the localStorage adapter uses. */
export type GameSaveWebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/**
 * localStorage storage scoped by a key prefix and game id. The editor uses it because projects have no
 * key-value storage API for play sessions.
 */
export function createLocalGameSaveStorage(gameId: string, storage: GameSaveWebStorage, prefix = "nodetool.game.saves"): GameSaveStorage {
  const key = (scope: GameSaveScope, slot: string): string => `${prefix}/${saveKey(gameId, scope, slot)}`;
  const slots = (scope: GameSaveScope): string[] => {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name?.startsWith(`${prefix}/`)) { keys.push(name.slice(prefix.length + 1)); }
    }
    return slotsUnder(keys, gameId, scope);
  };
  return {
    read: async (scope, slot) => {
      const stored = storage.getItem(key(scope, slot));
      return stored === null ? undefined : JSON.parse(stored) as unknown;
    },
    write: async (scope, slot, record: GameSaveRecord, options) => {
      const write = (): boolean => {
        const existing = slots(scope);
        if (options?.onlyIfEmpty && existing.includes(slot)) { return false; }
        if (!existing.includes(slot) && existing.length >= (options?.maxSlots ?? MAX_GAME_SAVE_SLOTS)) { throw new Error("Game save slot limit reached"); }
        storage.setItem(key(scope, slot), JSON.stringify(record));
        return true;
      };
      const locks = globalThis.navigator?.locks;
      return locks ? locks.request(`${prefix}/${gameId}/${scope}`, async () => write()) : write();
    },
    remove: async (scope, slot) => { storage.removeItem(key(scope, slot)); },
    slots: async (scope) => slots(scope)
  };
}

/**
 * Reads the progress quick save. When the slot is empty, a snapshot saved under the player's earlier
 * localStorage key is moved into the slot once and the old key is removed.
 */
export async function loadQuickSave(saves: GamePlayerSaves, slot: string, legacy: { readonly storage: GameSaveWebStorage; readonly key: string }): Promise<GameSaveRecord | null> {
  const record = await saves.load("progress", slot);
  if (record !== null) { return record; }
  const stored = legacy.storage.getItem(legacy.key);
  if (stored === null) { return null; }
  const migrated = await saves.initialize(slot, JSON.parse(stored) as unknown);
  if (migrated) { legacy.storage.removeItem(legacy.key); }
  return saves.load("progress", slot);
}
