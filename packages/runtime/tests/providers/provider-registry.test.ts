import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getRegisteredProvider,
  getProvider,
  clearProviderCache,
  listRegisteredProviderIds,
  setSecretResolver
} from "../../src/providers/provider-registry.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";

class SecretAwareFakeProvider extends FakeProvider {
  receivedOptions: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    super();
    this.receivedOptions = options;
  }
}

// We need to clear state between tests. The registry is module-level.
// We'll use unique IDs per test to avoid cross-contamination.

describe("provider-registry", () => {
  const uniqueId = () =>
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeEach(() => {
    clearProviderCache();
    setSecretResolver((_key, _userId) => undefined);
  });

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

  it("scopes provider cache and secret resolution by user id", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, {
      TEST_SECRET: undefined
    });
    setSecretResolver((key, userId) => `${key}-${userId}`);

    const provider1 = (await getProvider(
      id,
      "user-1"
    )) as SecretAwareFakeProvider;
    const provider2 = (await getProvider(
      id,
      "user-2"
    )) as SecretAwareFakeProvider;

    expect(provider1).toBeInstanceOf(SecretAwareFakeProvider);
    expect(provider2).toBeInstanceOf(SecretAwareFakeProvider);
    expect(provider1).not.toBe(provider2);
    expect(provider1.receivedOptions.TEST_SECRET).toBe("TEST_SECRET-user-1");
    expect(provider2.receivedOptions.TEST_SECRET).toBe("TEST_SECRET-user-2");
  });
});
