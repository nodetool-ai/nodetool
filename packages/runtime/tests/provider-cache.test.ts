import { describe, it, expect } from "vitest";
import {
  clearProviderCache,
  getProviderCacheVersion
} from "../src/provider-cache.js";

describe("provider cache version", () => {
  it("increments the version by exactly one on each clear", () => {
    const before = getProviderCacheVersion();
    clearProviderCache();
    expect(getProviderCacheVersion()).toBe(before + 1);
    clearProviderCache();
    expect(getProviderCacheVersion()).toBe(before + 2);
  });

  it("is stable between clears", () => {
    const a = getProviderCacheVersion();
    expect(getProviderCacheVersion()).toBe(a);
  });
});
