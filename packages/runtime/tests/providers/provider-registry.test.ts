import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getRegisteredProvider,
  getProvider,
  clearProviderCache,
  listRegisteredProviderIds,
} from "../../src/providers/provider-registry.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";

// We need to clear state between tests. The registry is module-level.
// We'll use unique IDs per test to avoid cross-contamination.

describe("provider-registry", () => {
  const uniqueId = () => `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it("registerProvider and getRegisteredProvider", () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const reg = getRegisteredProvider(id);
    expect(reg).not.toBeNull();
    expect(reg!.cls).toBe(FakeProvider);
    expect(reg!.kwargs).toEqual({});
  });

  it("registerProvider with kwargs", () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any, { textResponse: "hello" });
    const reg = getRegisteredProvider(id);
    expect(reg!.kwargs).toEqual({ textResponse: "hello" });
  });

  it("getRegisteredProvider returns null for unregistered", () => {
    expect(getRegisteredProvider("nonexistent-" + Date.now())).toBeNull();
  });

  it("getProvider creates and caches instance", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const provider = await getProvider(id);
    expect(provider).toBeInstanceOf(FakeProvider);
    // Second call should return same instance
    const provider2 = await getProvider(id);
    expect(provider2).toBe(provider);
  });

  it("getProvider throws for unregistered provider", async () => {
    await expect(getProvider("nonexistent-" + Date.now())).rejects.toThrow(
      /No provider registered/
    );
  });

  it("clearProviderCache returns count and clears", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    await getProvider(id); // populate cache
    const count = clearProviderCache();
    expect(count).toBeGreaterThanOrEqual(1);
    // After clearing, a new instance should be created
    const provider = await getProvider(id);
    expect(provider).toBeInstanceOf(FakeProvider);
  });

  it("listRegisteredProviderIds includes registered ids", () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const ids = listRegisteredProviderIds();
    expect(ids).toContain(id);
  });
});
