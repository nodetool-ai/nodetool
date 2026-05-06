import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getRegisteredProvider,
  getProvider,
  listRegisteredProviderIds
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
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const noSecrets = async () => undefined;

describe("provider-registry", () => {
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

  it("getProvider builds a fresh instance per call (no module cache)", async () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const a = await getProvider(id, noSecrets);
    const b = await getProvider(id, noSecrets);
    expect(a).toBeInstanceOf(FakeProvider);
    expect(b).toBeInstanceOf(FakeProvider);
    // No module-level cache: each call constructs anew. Per-job reuse is the
    // ProcessingContext's responsibility.
    expect(a).not.toBe(b);
  });

  it("getProvider throws for unregistered provider", async () => {
    await expect(
      getProvider("nonexistent-" + Date.now(), noSecrets)
    ).rejects.toThrow(/No provider registered/);
  });

  it("listRegisteredProviderIds includes registered ids", () => {
    const id = uniqueId();
    registerProvider(id, FakeProvider as any);
    const ids = listRegisteredProviderIds();
    expect(ids).toContain(id);
  });

  it("getProvider resolves empty kwargs through the supplied getSecret", async () => {
    const id = uniqueId();
    registerProvider(id, SecretAwareFakeProvider as any, {
      TEST_SECRET: undefined
    });

    const calls: string[] = [];
    const getSecret = async (key: string) => {
      calls.push(key);
      return `value-of-${key}`;
    };

    const p = (await getProvider(id, getSecret)) as SecretAwareFakeProvider;
    expect(p.receivedOptions.TEST_SECRET).toBe("value-of-TEST_SECRET");
    expect(calls).toEqual(["TEST_SECRET"]);
  });
});
