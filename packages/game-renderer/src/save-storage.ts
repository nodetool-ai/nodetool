import type { GameSaveRecord, GameSaveStorage } from "@nodetool-ai/game-runtime";
import type { GameSaveScope } from "@nodetool-ai/protocol";

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
export function createIndexedDbGameSaveStorage(gameId: string, factory: IDBFactory = globalThis.indexedDB): GameSaveStorage {
  let opened: Promise<IDBDatabase> | undefined;
  const database = (): Promise<IDBDatabase> => opened ??= new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opened = undefined; reject(request.error ?? new Error("Game save storage could not open")); };
  });
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const transaction = (await database()).transaction(STORE, mode);
    const result = settle(action(transaction.objectStore(STORE)));
    if (mode === "readonly") { return result; }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Game save storage write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Game save storage write was aborted"));
    });
    return result;
  };
  return {
    read: (scope, slot) => run("readonly", (store) => store.get(saveKey(gameId, scope, slot))),
    write: async (scope, slot, record) => { await run("readwrite", (store) => store.put(record, saveKey(gameId, scope, slot))); },
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
  return {
    read: async (scope, slot) => {
      const stored = storage.getItem(key(scope, slot));
      return stored === null ? undefined : JSON.parse(stored) as unknown;
    },
    write: async (scope, slot, record: GameSaveRecord) => { storage.setItem(key(scope, slot), JSON.stringify(record)); },
    remove: async (scope, slot) => { storage.removeItem(key(scope, slot)); },
    slots: async (scope) => {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const name = storage.key(index);
        if (name?.startsWith(`${prefix}/`)) { keys.push(name.slice(prefix.length + 1)); }
      }
      return slotsUnder(keys, gameId, scope);
    }
  };
}
