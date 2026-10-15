import { describe, expect, it } from "vitest";
import { GamePlayerSaves } from "@nodetool-ai/game-runtime";

import { createIndexedDbGameSaveStorage, createLocalGameSaveStorage, loadQuickSave, type GameSaveWebStorage } from "../src/save-storage.js";

/** The IndexedDB surface the adapter uses, backed by one shared map per database name. Callbacks fire asynchronously. */
function fakeIndexedDb(): { factory: IDBFactory; rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  let tail = Promise.resolve();
  const request = <T>(produce: () => T, transaction?: { ready: Promise<void>; pending: number; done(): void }) => {
    const handle = { result: undefined as T | undefined, error: null, onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
    if (transaction) { transaction.pending += 1; }
    void (transaction?.ready ?? Promise.resolve()).then(() => {
      handle.result = produce();
      handle.onsuccess?.();
      if (transaction) { transaction.pending -= 1; transaction.done(); }
    });
    return handle;
  };
  const database = {
    createObjectStore: () => undefined,
    transaction: () => {
      const ready = tail;
      let release = (): void => undefined;
      tail = new Promise<void>(resolve => { release = resolve; });
      const transaction = {
        ready, pending: 0, oncomplete: null as null | (() => void), onerror: null, onabort: null, error: null,
        done() { if (this.pending === 0) { queueMicrotask(() => { transaction.oncomplete?.(); release(); }); } },
        objectStore: () => ({
          get: (key: string) => request(() => structuredClone(rows.get(key)), transaction),
          put: (value: unknown, key: string) => request(() => { rows.set(key, structuredClone(value)); return key; }, transaction),
          delete: (key: string) => request(() => { rows.delete(key); }, transaction),
          getAllKeys: () => request(() => [...rows.keys()], transaction)
        })
      };
      return transaction;
    }
  };
  const factory = {
    open: () => {
      const opening = { result: database, error: null, onsuccess: null as null | (() => void), onerror: null, onupgradeneeded: null as null | (() => void) };
      queueMicrotask(() => { opening.onupgradeneeded?.(); opening.onsuccess?.(); });
      return opening;
    }
  };
  return { factory: factory as unknown as IDBFactory, rows };
}

function memoryWebStorage(): GameSaveWebStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get length() { return items.size; },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: (key) => { items.delete(key); }
  };
}

describe.each([
  ["IndexedDB", (gameId: string, shared: ReturnType<typeof fakeIndexedDb>) => createIndexedDbGameSaveStorage(gameId, shared.factory)],
  ["localStorage", (gameId: string, shared: { web: ReturnType<typeof memoryWebStorage> }) => createLocalGameSaveStorage(gameId, shared.web)]
] as const)("%s save storage", (_name, create) => {
  const shared = () => ({ ...fakeIndexedDb(), web: memoryWebStorage() });

  it("keeps progress and settings saves apart and scopes them per game", async () => {
    const backing = shared();
    const first = new GamePlayerSaves(create("game-a", backing as never));
    const second = new GamePlayerSaves(create("game-b", backing as never));
    await first.save("progress", "main", { level: 2 }, { tick: 30 });
    await first.save("settings", "main", { volume: 0.4 });
    await second.save("progress", "main", { level: 9 });
    expect(await first.load("progress", "main")).toEqual({ version: 1, data: { level: 2 }, snapshot: { tick: 30 } });
    expect(await first.load("settings", "main")).toEqual({ version: 1, data: { volume: 0.4 } });
    expect(await second.load("progress", "main")).toEqual({ version: 1, data: { level: 9 } });
    expect(await second.slots("settings")).toEqual([]);
    await first.remove("progress", "main");
    expect(await first.load("progress", "main")).toBeNull();
    expect(await first.slots("settings")).toEqual(["main"]);
    expect(await second.slots("progress")).toEqual(["main"]);
  });

  it("enforces the slot limit across independent players sharing storage", async () => {
    const backing = shared();
    const first = new GamePlayerSaves(create("concurrent", backing as never));
    const second = new GamePlayerSaves(create("concurrent", backing as never));
    for (let i = 0; i < 15; i++) { await first.save("progress", `slot${i}`, {}); }
    const results = await Promise.allSettled([first.save("progress", "first", {}), second.save("progress", "second", {})]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await first.slots("progress")).toHaveLength(16);
  });

  it("delivers a script load through the host loop on the next frame", async () => {
    const saves = new GamePlayerSaves(create("game-a", shared() as never));
    saves.handle([{ kind: "save", tick: 3, entityId: "e", scope: "progress", slot: "run", data: { coins: 4 }, snapshot: false },
      { kind: "load", tick: 3, entityId: "e", scope: "progress", slot: "run" }], () => null);
    await saves.idle();
    expect(saves.withLoaded({ pressed: [], justPressed: [] }).loaded).toEqual([{ scope: "progress", slot: "run", data: { coins: 4 } }]);
  });
});

it("stores IndexedDB rows under game, scope and slot keys", async () => {
  const backing = fakeIndexedDb();
  await createIndexedDbGameSaveStorage("g1", backing.factory).write("settings", "audio", { version: 1, data: { volume: 1 } });
  expect([...backing.rows.keys()]).toEqual(["g1/settings/audio"]);
});

it("prefixes localStorage keys so other editor data is never listed as a slot", async () => {
  const web = memoryWebStorage();
  web.setItem("nodetool.game.save.g1", "{}");
  const storage = createLocalGameSaveStorage("g1", web);
  await storage.write("progress", "main", { version: 1, data: {} });
  expect([...web.items.keys()]).toEqual(["nodetool.game.save.g1", "nodetool.game.saves/g1/progress/main"]);
  expect(await storage.slots("progress")).toEqual(["main"]);
});

it("rejects a failed IndexedDB write once, with no unhandled rejection", async () => {
  const failure = new Error("QuotaExceededError");
  const database = {
    transaction: () => {
      const transaction = {
        oncomplete: null, onerror: null, onabort: null as null | (() => void), error: failure,
        objectStore: () => ({
          put: () => {
            const handle = { result: undefined, error: failure, onsuccess: null, onerror: null as null | (() => void) };
            // A failed request fires its error, then the transaction aborts.
            queueMicrotask(() => { handle.onerror?.(); queueMicrotask(() => transaction.onabort?.()); });
            return handle;
          }
        })
      };
      return transaction;
    }
  };
  const factory = {
    open: () => {
      const opening = { result: database, error: null, onsuccess: null as null | (() => void), onerror: null, onupgradeneeded: null };
      queueMicrotask(() => opening.onsuccess?.());
      return opening;
    }
  } as unknown as IDBFactory;
  const unhandled: unknown[] = [];
  const listener = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    await expect(createIndexedDbGameSaveStorage("g", factory).write("progress", "main", { version: 1, data: {} })).rejects.toBe(failure);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
  } finally { process.off("unhandledRejection", listener); }
});

describe("quick save migration", () => {
  const legacyKey = "nodetool-game:g1:r1:save";

  it("moves an old localStorage quick save into the empty IndexedDB slot once and removes the old key", async () => {
    const backing = fakeIndexedDb();
    const web = memoryWebStorage();
    web.setItem(legacyKey, JSON.stringify({ tick: 42 }));
    const saves = new GamePlayerSaves(createIndexedDbGameSaveStorage("g1", backing.factory));
    expect(await loadQuickSave(saves, "quicksave", { storage: web, key: legacyKey })).toEqual({ version: 1, data: {}, snapshot: { tick: 42 } });
    expect(web.getItem(legacyKey)).toBeNull();
    expect([...backing.rows.keys()]).toEqual(["g1/progress/quicksave"]);
    expect(await loadQuickSave(saves, "quicksave", { storage: web, key: legacyKey })).toEqual({ version: 1, data: {}, snapshot: { tick: 42 } });
  });

  it("prefers the IndexedDB slot and leaves the old key alone when the slot has a save", async () => {
    const web = memoryWebStorage();
    web.setItem(legacyKey, JSON.stringify({ tick: 1 }));
    const saves = new GamePlayerSaves(createIndexedDbGameSaveStorage("g1", fakeIndexedDb().factory));
    await saves.save("progress", "quicksave", {}, { tick: 7 });
    expect((await loadQuickSave(saves, "quicksave", { storage: web, key: legacyKey }))?.snapshot).toEqual({ tick: 7 });
    expect(web.getItem(legacyKey)).toBe(JSON.stringify({ tick: 1 }));
  });

  it("returns null with no save anywhere and keeps an unreadable old save in place", async () => {
    const web = memoryWebStorage();
    const saves = new GamePlayerSaves(createIndexedDbGameSaveStorage("g1", fakeIndexedDb().factory));
    expect(await loadQuickSave(saves, "quicksave", { storage: web, key: legacyKey })).toBeNull();
    web.setItem(legacyKey, "{not json");
    await expect(loadQuickSave(saves, "quicksave", { storage: web, key: legacyKey })).rejects.toThrow(SyntaxError);
    expect(web.getItem(legacyKey)).toBe("{not json");
  });
});

it("limits slots across local storage player instances", async () => {
  const web = memoryWebStorage();
  const first = new GamePlayerSaves(createLocalGameSaveStorage("g", web));
  const second = new GamePlayerSaves(createLocalGameSaveStorage("g", web));
  for (let i = 0; i < 15; i++) { await first.save("progress", `slot${i}`, {}); }
  const results = await Promise.allSettled([first.save("progress", "first", {}), second.save("progress", "second", {})]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(await first.slots("progress")).toHaveLength(16);
});

it("does not overwrite an acknowledged save during legacy migration", async () => {
  const web = memoryWebStorage();
  web.setItem("legacy", JSON.stringify({ tick: 42 }));
  const saves = new GamePlayerSaves(createLocalGameSaveStorage("g", web));
  const loading = loadQuickSave(saves, "quicksave", { storage: web, key: "legacy" });
  await saves.save("progress", "quicksave", { level: 999 });
  expect((await loading)?.data).toEqual({ level: 999 });
  expect(web.getItem("legacy")).not.toBeNull();
});
