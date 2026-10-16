import { afterEach, describe, expect, it } from "vitest";
import { createIndexedDbGameSaveStorage } from "../src/save-storage.js";

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
afterEach(() => {
  if (originalIndexedDb) { Object.defineProperty(globalThis, "indexedDB", originalIndexedDb); }
  else { Reflect.deleteProperty(globalThis, "indexedDB"); }
});

describe("standalone save storage availability", () => {
  it("does not acquire a blocked IndexedDB property until a save operation", async () => {
    let acquisitions = 0;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => {
      acquisitions += 1;
      throw new DOMException("Storage blocked", "SecurityError");
    } });
    const storage = createIndexedDbGameSaveStorage("blocked-game");
    expect(acquisitions).toBe(0);
    await expect(storage.read("progress", "main")).rejects.toThrow(/save storage.*unavailable/i);
    expect(acquisitions).toBe(1);
  });

  it("reports unavailable IndexedDB without preventing adapter construction", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    const storage = createIndexedDbGameSaveStorage("unavailable-game");
    await expect(storage.read("progress", "main")).rejects.toThrow(/save storage.*unavailable/i);
  });

  it("retries a synchronous open failure on the next explicit save operation", async () => {
    let attempts = 0;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open: () => {
      attempts += 1;
      throw new DOMException("Storage blocked", "SecurityError");
    } } });
    const storage = createIndexedDbGameSaveStorage("retry-game");
    await expect(storage.read("progress", "main")).rejects.toThrow();
    await expect(storage.read("progress", "main")).rejects.toThrow();
    expect(attempts).toBe(2);
  });
});
