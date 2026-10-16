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

  it("retries an asynchronous open rejection without caching the failed database", async () => {
    let attempts = 0;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open: () => {
      attempts += 1;
      const request: { error: DOMException; onerror: (() => void) | null } = {
        error: new DOMException("Open denied", "SecurityError"), onerror: null
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    } } });
    const storage = createIndexedDbGameSaveStorage("open-error-game");
    await expect(storage.read("progress", "main")).rejects.toThrow(/save storage.*unavailable/i);
    await expect(storage.read("progress", "main")).rejects.toThrow(/save storage.*unavailable/i);
    expect(attempts).toBe(2);
  });

  it("rejects a write when its request and transaction fail", async () => {
    const failure = new DOMException("Save quota exceeded", "QuotaExceededError");
    type FailedRequest = { error: DOMException; onerror: (() => void) | null };
    type FailedTransaction = { error: DOMException; onabort: (() => void) | null; onerror: (() => void) | null;
      objectStore: () => { put: () => FailedRequest } };
    let aborted = false;
    const transaction: FailedTransaction = {
      error: failure, onabort: null, onerror: null,
      objectStore: () => ({ put: () => {
        const request: FailedRequest = { error: failure, onerror: null };
        queueMicrotask(() => { request.onerror?.(); aborted = true; transaction.onabort?.(); });
        return request;
      } })
    };
    const database = { transaction: () => transaction };
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open: () => {
      const request: { result: typeof database; onsuccess: (() => void) | null } = { result: database, onsuccess: null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    } } });
    const storage = createIndexedDbGameSaveStorage("write-error-game");
    await expect(storage.write("progress", "main", { version: 1, data: {} })).rejects.toThrow("Save quota exceeded");
    expect(aborted).toBe(true);
  });

});
