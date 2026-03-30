/**
 * Edge-case tests for MemoryNodeCache.
 *
 * Covers: very small TTL, null/undefined values, overwriting keys,
 * clear while entries exist, and various value types.
 */

import { describe, it, expect, vi } from "vitest";
import { MemoryNodeCache } from "../src/memory-node-cache.js";

describe("MemoryNodeCache edge cases", () => {
  it("stores and retrieves null values", async () => {
    const cache = new MemoryNodeCache();
    await cache.set("key", null);
    const result = await cache.get("key");
    expect(result).toBeNull();
  });

  it("stores and retrieves undefined values", async () => {
    const cache = new MemoryNodeCache();
    await cache.set("key", undefined);
    const result = await cache.get("key");
    expect(result).toBeUndefined();
  });

  it("stores and retrieves complex objects", async () => {
    const cache = new MemoryNodeCache();
    const obj = { nested: { deep: [1, 2, 3] }, flag: true };
    await cache.set("obj", obj);
    const result = await cache.get("obj");
    expect(result).toEqual(obj);
  });

  it("overwriting key replaces value", async () => {
    const cache = new MemoryNodeCache();
    await cache.set("key", "first");
    await cache.set("key", "second");
    expect(await cache.get("key")).toBe("second");
  });

  it("overwriting key resets TTL", async () => {
    const cache = new MemoryNodeCache();
    vi.useFakeTimers();

    try {
      await cache.set("key", "val1", 2); // 2 seconds
      vi.advanceTimersByTime(1500); // 1.5 seconds
      await cache.set("key", "val2", 2); // reset TTL
      vi.advanceTimersByTime(1500); // 1.5 more seconds (3s total from first set)
      // Should still be valid since TTL was reset
      const result = await cache.get("key");
      expect(result).toBe("val2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("delete non-existent key does not throw", async () => {
    const cache = new MemoryNodeCache();
    await expect(cache.delete("nonexistent")).resolves.not.toThrow();
  });

  it("clear removes all entries", async () => {
    const cache = new MemoryNodeCache();
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);
    await cache.clear();
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("c")).toBeUndefined();
  });

  it("no TTL means value never expires", async () => {
    const cache = new MemoryNodeCache();
    vi.useFakeTimers();

    try {
      await cache.set("eternal", "forever"); // no TTL
      vi.advanceTimersByTime(999_999_999); // very far in the future
      expect(await cache.get("eternal")).toBe("forever");
    } finally {
      vi.useRealTimers();
    }
  });

  it("TTL of 0 seconds expires immediately", async () => {
    const cache = new MemoryNodeCache();
    vi.useFakeTimers();

    try {
      await cache.set("instant", "gone", 0);
      // TTL is 0 * 1000 = 0ms, so expiresAt = Date.now() + 0
      // Date.now() >= expiresAt should be true immediately
      const result = await cache.get("instant");
      expect(result).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles many keys", async () => {
    const cache = new MemoryNodeCache();
    for (let i = 0; i < 1000; i++) {
      await cache.set(`key-${i}`, i);
    }
    expect(await cache.get("key-0")).toBe(0);
    expect(await cache.get("key-999")).toBe(999);
  });

  it("get returns undefined for expired entry and removes it", async () => {
    const cache = new MemoryNodeCache();
    vi.useFakeTimers();

    try {
      await cache.set("expiring", "value", 1); // 1 second TTL
      vi.advanceTimersByTime(2000); // 2 seconds
      expect(await cache.get("expiring")).toBeUndefined();
      // Getting it again should still be undefined (was deleted)
      expect(await cache.get("expiring")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
