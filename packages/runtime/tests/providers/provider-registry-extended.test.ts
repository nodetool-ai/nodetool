import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  isProviderConfigured,
  getProviderSecretKey
} from "../../src/providers/provider-registry.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";
import { PythonProvider } from "../../src/providers/python-provider.js";

class SecretAwareFakeProvider extends FakeProvider {
  receivedOptions: Record<string, unknown>;
  constructor(options: Record<string, unknown> = {}) {
    super();
    this.receivedOptions = options;
  }
}

const uniqueId = () =>
  `test-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const noSecrets = async () => undefined;

describe("provider-registry — extended coverage", () => {
  // --- Per-call construction (no module cache) ---

  it("getProvider builds a fresh instance per call", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const a = await getProvider(id, noSecrets);
    const b = await getProvider(id, noSecrets);
    // Per-job reuse is the ProcessingContext's job, not the registry's.
    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(FakeProvider);
    expect(b).toBeInstanceOf(FakeProvider);
  });

  // --- getSecret callback resolves missing kwargs ---

  it("different callers' resolvers produce independent provider state", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, { MY_KEY: undefined });

    const pA = (await getProvider(
      id,
      async (key) => `for-alice-${key}`
    )) as SecretAwareFakeProvider;
    const pB = (await getProvider(
      id,
      async (key) => `for-bob-${key}`
    )) as SecretAwareFakeProvider;

    expect(pA.receivedOptions.MY_KEY).toBe("for-alice-MY_KEY");
    expect(pB.receivedOptions.MY_KEY).toBe("for-bob-MY_KEY");
  });

  // --- isProviderConfigured ---

  it("isProviderConfigured returns true for provider without secret requirement", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any); // no kwargs
    expect(await isProviderConfigured(id, noSecrets)).toBe(true);
  });

  it("isProviderConfigured checks per-call secret resolver", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, {
      API_KEY: undefined
    });
    expect(
      await isProviderConfigured(id, async (key) =>
        key === "API_KEY" ? "resolved" : undefined
      )
    ).toBe(true);
    expect(await isProviderConfigured(id, noSecrets)).toBe(false);
  });

  // --- getProviderSecretKey (pure registry inspection) ---

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

  // --- env var fallback ---

  it("falls back to process.env when resolver returns nothing", async () => {
    const id = uniqueId();
    const envKey = `TEST_FALLBACK_KEY_${Date.now()}`;
    registerProvider(id, SecretAwareFakeProvider as any, {
      [envKey]: undefined
    });
    process.env[envKey] = "from-env";
    try {
      const p = (await getProvider(id, noSecrets)) as SecretAwareFakeProvider;
      expect(p.receivedOptions[envKey]).toBe("from-env");
    } finally {
      delete process.env[envKey];
    }
  });

  it("instantiates PythonProvider from registry kwargs and preserves bridge access", async () => {
    const id = uniqueId();
    const bridge = {
      getProviderModels: async (
        providerId: string,
        modelType: string,
        secrets: Record<string, string>
      ) => [{ id: `${providerId}-${modelType}`, name: "Test Model", secrets }]
    };

    registerProvider(id, PythonProvider as any, {
      _id: "huggingface",
      _bridge: bridge
    });

    const provider = (await getProvider(id, noSecrets)) as PythonProvider;

    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      {
        id: "huggingface-language",
        name: "Test Model",
        secrets: {}
      }
    ]);
  });
});
