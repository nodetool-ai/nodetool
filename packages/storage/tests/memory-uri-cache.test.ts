import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryUriCache } from "../src/memory-uri-cache.js";

describe("MemoryUriCache", () => {
  let cache: MemoryUriCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new MemoryUriCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("set and get", () => {
    it("stores and retrieves a URL", () => {
      cache.set("key1", "https://example.com/file.txt");
      expect(cache.get("key1")).toBe("https://example.com/file.txt");
    });

    it("returns null for missing keys", () => {
      expect(cache.get("nonexistent")).toBeNull();
    });

    it("overwrites existing entries", () => {
      cache.set("key1", "url1");
      cache.set("key1", "url2");
      expect(cache.get("key1")).toBe("url2");
    });
  });

  describe("TTL expiry", () => {
    it("expires entries after default TTL", () => {
      cache.set("key1", "url1");
      expect(cache.get("key1")).toBe("url1");

      // Advance time past default TTL (1 hour)
      vi.advanceTimersByTime(3_600_001);
      expect(cache.get("key1")).toBeNull();
    });

    it("respects custom TTL", () => {
      cache.set("key1", "url1", 5000); // 5 seconds

      vi.advanceTimersByTime(4999);
      expect(cache.get("key1")).toBe("url1");

      vi.advanceTimersByTime(2);
      expect(cache.get("key1")).toBeNull();
    });

    it("does not expire entries before TTL", () => {
      cache.set("key1", "url1", 10_000);
      vi.advanceTimersByTime(9_999);
      expect(cache.get("key1")).toBe("url1");
    });

    it("uses default TTL when custom TTL is 0 or negative", () => {
      cache.set("key1", "url1", 0);
      vi.advanceTimersByTime(3_600_001);
      expect(cache.get("key1")).toBeNull();
    });
  });

  describe("custom default TTL", () => {
    it("uses custom default TTL from constructor", () => {
      const shortCache = new MemoryUriCache(2000);
      shortCache.set("key1", "url1");

      vi.advanceTimersByTime(1999);
      expect(shortCache.get("key1")).toBe("url1");

      vi.advanceTimersByTime(2);
      expect(shortCache.get("key1")).toBeNull();
    });

    it("falls back to 1 hour for invalid constructor TTL", () => {
      const badCache = new MemoryUriCache(-1);
      badCache.set("key1", "url1");

      vi.advanceTimersByTime(3_599_999);
      expect(badCache.get("key1")).toBe("url1");

      vi.advanceTimersByTime(2);
      expect(badCache.get("key1")).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes an entry", () => {
      cache.set("key1", "url1");
      cache.delete("key1");
      expect(cache.get("key1")).toBeNull();
    });

    it("is a no-op for missing keys", () => {
      cache.delete("nonexistent"); // Should not throw
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set("key1", "url1");
      cache.set("key2", "url2");
      cache.set("key3", "url3");
      expect(cache.size).toBe(3);

      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBeNull();
    });
  });

  describe("size", () => {
    it("returns 0 for empty cache", () => {
      expect(cache.size).toBe(0);
    });

    it("tracks the number of entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.size).toBe(2);
    });

    it("includes expired entries in size (lazy eviction)", () => {
      cache.set("key1", "url1", 1000);
      vi.advanceTimersByTime(2000);
      // Expired but not yet evicted
      expect(cache.size).toBe(1);
      // Access triggers eviction
      cache.get("key1");
      expect(cache.size).toBe(0);
    });
  });

  describe("additional edge cases", () => {
    it("set then immediately get returns value (no timer advance)", () => {
      cache.set("instant", "https://example.com/instant");
      expect(cache.get("instant")).toBe("https://example.com/instant");
    });

    it("overwrite with different TTL applies new TTL", () => {
      cache.set("key1", "url1", 5000);
      // Overwrite with longer TTL
      cache.set("key1", "url1-v2", 10000);

      // After 5001ms the first TTL would have expired, but new TTL is 10s
      vi.advanceTimersByTime(5001);
      expect(cache.get("key1")).toBe("url1-v2");

      // After 10001ms total, it should expire
      vi.advanceTimersByTime(5000);
      expect(cache.get("key1")).toBeNull();
    });

    it("multiple keys with different TTLs expire independently", () => {
      cache.set("short", "url-short", 2000);
      cache.set("medium", "url-medium", 5000);
      cache.set("long", "url-long", 10000);

      vi.advanceTimersByTime(2001);
      expect(cache.get("short")).toBeNull();
      expect(cache.get("medium")).toBe("url-medium");
      expect(cache.get("long")).toBe("url-long");

      vi.advanceTimersByTime(3000); // 5001ms total
      expect(cache.get("medium")).toBeNull();
      expect(cache.get("long")).toBe("url-long");

      vi.advanceTimersByTime(5000); // 10001ms total
      expect(cache.get("long")).toBeNull();
    });

    it("delete a non-existent key is a no-op", () => {
      expect(() => cache.delete("does-not-exist")).not.toThrow();
      expect(cache.size).toBe(0);
    });

    it("set with very large TTL does not crash", () => {
      expect(() => {
        cache.set("huge-ttl", "url", Number.MAX_SAFE_INTEGER);
      }).not.toThrow();
      expect(cache.get("huge-ttl")).toBe("url");
    });

    it("rapid set and get of same key returns latest value", () => {
      for (let i = 0; i < 100; i++) {
        cache.set("rapid", `url-${i}`);
      }
      expect(cache.get("rapid")).toBe("url-99");
      expect(cache.size).toBe(1);
    });
  });
});
