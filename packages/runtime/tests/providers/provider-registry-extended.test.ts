import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getProvider,
  clearProviderCache,
  setSecretResolver,
  isProviderConfigured,
  getProviderSecretKey
} from "../../src/providers/provider-registry.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";

class SecretAwareFakeProvider extends FakeProvider {
  receivedOptions: Record<string, unknown>;
  constructor(options: Record<string, unknown> = {}) {
    super();
    this.receivedOptions = options;
  }
}

const uniqueId = () =>
  `test-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("provider-registry — extended coverage", () => {
  beforeEach(() => {
    clearProviderCache();
    setSecretResolver((_key, _userId) => undefined);
  });

  // --- Per-user cache isolation ---

  it("same provider + same userId returns cached instance", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const a = await getProvider(id, "user-A");
    const b = await getProvider(id, "user-A");
    expect(a).toBe(b);
  });

  it("same provider + different userId returns distinct instances", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const a = await getProvider(id, "user-A");
    const b = await getProvider(id, "user-B");
    expect(a).not.toBe(b);
  });

  it("different users get secrets resolved independently", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, { MY_KEY: undefined });

    const resolverCalls: Array<[string, string]> = [];
    setSecretResolver((key, userId) => {
      resolverCalls.push([key, userId]);
      return `secret-for-${userId}`;
    });

    const pA = (await getProvider(id, "alice")) as SecretAwareFakeProvider;
    const pB = (await getProvider(id, "bob")) as SecretAwareFakeProvider;

    expect(pA.receivedOptions.MY_KEY).toBe("secret-for-alice");
    expect(pB.receivedOptions.MY_KEY).toBe("secret-for-bob");
    expect(resolverCalls).toContainEqual(["MY_KEY", "alice"]);
    expect(resolverCalls).toContainEqual(["MY_KEY", "bob"]);
  });

  // --- setSecretResolver clears cache ---

  it("setSecretResolver clears the provider cache", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const before = await getProvider(id, "u1");
    // Setting a new resolver clears the cache
    setSecretResolver(() => undefined);
    const after = await getProvider(id, "u1");
    expect(before).not.toBe(after);
  });

  // --- clearProviderCache ---

  it("clearProviderCache returns correct count", async () => {
    const id1 = uniqueId();
    const id2 = uniqueId();
    registerProvider(id1, FakeProvider as any);
    registerProvider(id2, FakeProvider as any);
    await getProvider(id1, "u1");
    await getProvider(id1, "u2");
    await getProvider(id2, "u1");
    const cleared = clearProviderCache();
    expect(cleared).toBeGreaterThanOrEqual(3);
  });

  // --- isProviderConfigured per-user ---

  it("isProviderConfigured returns true for provider without secret requirement", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any); // no kwargs
    expect(await isProviderConfigured(id, "anyone")).toBe(true);
  });

  it("isProviderConfigured checks per-user secret", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, {
      API_KEY: undefined
    });
    setSecretResolver((key, userId) =>
      userId === "has-key" ? "resolved" : undefined
    );
    expect(await isProviderConfigured(id, "has-key")).toBe(true);
    expect(await isProviderConfigured(id, "no-key")).toBe(false);
  });

  // --- getProviderSecretKey ---

  it("getProviderSecretKey returns key name containing KEY/TOKEN/SECRET", () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any, { OPENAI_API_KEY: undefined });
    expect(getProviderSecretKey(id)).toBe("OPENAI_API_KEY");
  });

  it("getProviderSecretKey returns null for local providers (no secret kwargs)", () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any, { OLLAMA_API_URL: undefined });
    expect(getProviderSecretKey(id)).toBeNull();
  });

  it("getProviderSecretKey returns null for unregistered provider", () => {
    expect(getProviderSecretKey("nonexistent-" + Date.now())).toBeNull();
  });

  // --- default userId ---

  it("getProvider defaults userId to '1'", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, {
      THE_KEY: undefined
    });
    const calls: string[] = [];
    setSecretResolver((_key, userId) => {
      calls.push(userId);
      return "val";
    });
    await getProvider(id);
    expect(calls).toContain("1");
  });

  // --- env var fallback ---

  it("falls back to process.env when resolver returns nothing", async () => {
    const id = uniqueId();
    const envKey = `TEST_FALLBACK_KEY_${Date.now()}`;
    registerProvider(id, SecretAwareFakeProvider as any, {
      [envKey]: undefined
    });
    setSecretResolver(() => undefined);
    process.env[envKey] = "from-env";
    try {
      const p = (await getProvider(id, "u1")) as SecretAwareFakeProvider;
      expect(p.receivedOptions[envKey]).toBe("from-env");
    } finally {
      delete process.env[envKey];
    }
  });
});
