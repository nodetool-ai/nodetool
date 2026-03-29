/**
 * Tests for T-ST-6/T-ST-7: AbstractNodeCache + MemoryNodeCache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryNodeCache } from "../src/memory-node-cache.js";

describe("T-ST-6/T-ST-7: MemoryNodeCache", () => {
  let cache: MemoryNodeCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new MemoryNodeCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("set and get value", async () => {
    await cache.set("key1", { data: 42 });
    expect(await cache.get("key1")).toEqual({ data: 42 });
  });

  it("get returns undefined for missing key", async () => {
    expect(await cache.get("nonexistent")).toBeUndefined();
  });

  it("set overwrites existing value", async () => {
    await cache.set("key1", "first");
    await cache.set("key1", "second");
    expect(await cache.get("key1")).toBe("second");
  });

  it("delete removes key", async () => {
    await cache.set("key1", "value");
    await cache.delete("key1");
    expect(await cache.get("key1")).toBeUndefined();
  });

  it("delete non-existent key is no-op", async () => {
    await cache.delete("nonexistent"); // should not throw
  });

  it("clear removes all keys", async () => {
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
  });

  it("TTL: value available before expiry", async () => {
    await cache.set("key1", "value", 10); // 10 seconds TTL
    vi.advanceTimersByTime(5000); // 5 seconds
    expect(await cache.get("key1")).toBe("value");
  });

  it("TTL: value expired after TTL", async () => {
    await cache.set("key1", "value", 2); // 2 seconds TTL
    vi.advanceTimersByTime(3000); // 3 seconds
    expect(await cache.get("key1")).toBeUndefined();
  });

  it("TTL: no TTL means no expiry", async () => {
    await cache.set("key1", "forever");
    vi.advanceTimersByTime(999999000);
    expect(await cache.get("key1")).toBe("forever");
  });

  it("stores various value types", async () => {
    await cache.set("num", 42);
    await cache.set("str", "hello");
    await cache.set("arr", [1, 2, 3]);
    await cache.set("obj", { a: { b: "c" } });
    await cache.set("bool", true);
    await cache.set("null", null);

    expect(await cache.get("num")).toBe(42);
    expect(await cache.get("str")).toBe("hello");
    expect(await cache.get("arr")).toEqual([1, 2, 3]);
    expect(await cache.get("obj")).toEqual({ a: { b: "c" } });
    expect(await cache.get("bool")).toBe(true);
    expect(await cache.get("null")).toBe(null);
  });
});
