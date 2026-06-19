import { describe, it, expect } from "vitest";
import {
  InMemorySecureCredentialStore,
  KeychainSecureCredentialStore,
  type KeyringBackend
} from "../../../src/providers/oauth/secure-credential-store.js";
import {
  SecureTokenStore,
  InMemoryTokenStore
} from "../../../src/providers/oauth/token-store.js";
import type { OAuthTokens } from "../../../src/providers/oauth/types.js";

const sampleTokens: OAuthTokens = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  tokenType: "Bearer",
  scope: "openid",
  expiresAt: 2_000_000,
  receivedAt: 1_000_000
};

/** A trivial in-memory keyring that mimics keytar's contract. */
function fakeKeyring(): KeyringBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getPassword: async (service, account) => store.get(`${service}:${account}`) ?? null,
    setPassword: async (service, account, password) => {
      store.set(`${service}:${account}`, password);
    },
    deletePassword: async (service, account) => store.delete(`${service}:${account}`)
  };
}

describe("KeychainSecureCredentialStore", () => {
  it("round-trips secrets through the injected keyring backend", async () => {
    const backend = fakeKeyring();
    const store = new KeychainSecureCredentialStore({ service: "svc", backend });
    expect(await store.get("k")).toBeNull();
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    expect(backend.store.get("svc:k")).toBe("v");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });
});

describe("SecureTokenStore", () => {
  it("persists tokens via the credential store and reloads them", async () => {
    const credentialStore = new InMemorySecureCredentialStore();
    const store = new SecureTokenStore({
      credentialStore,
      provider: "openai",
      accountId: "user-1"
    });

    expect(await store.load()).toBeNull();
    await store.save(sampleTokens);
    expect(await store.load()).toEqual(sampleTokens);

    // The serialized blob lives under a namespaced key, not a plaintext file.
    expect(await credentialStore.get("openai:user-1")).toContain("access-1");

    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("returns null for a corrupted stored blob instead of throwing", async () => {
    const credentialStore = new InMemorySecureCredentialStore();
    await credentialStore.set("openai:user-1", "{not-json");
    const store = new SecureTokenStore({
      credentialStore,
      provider: "openai",
      accountId: "user-1"
    });
    expect(await store.load()).toBeNull();
  });

  it("isolates accounts by namespaced key", async () => {
    const credentialStore = new InMemorySecureCredentialStore();
    const a = new SecureTokenStore({ credentialStore, provider: "openai", accountId: "a" });
    const b = new SecureTokenStore({ credentialStore, provider: "openai", accountId: "b" });
    await a.save(sampleTokens);
    expect(await b.load()).toBeNull();
  });
});

describe("InMemoryTokenStore", () => {
  it("supports the full load/save/clear lifecycle", async () => {
    const store = new InMemoryTokenStore();
    expect(await store.load()).toBeNull();
    await store.save(sampleTokens);
    expect(await store.load()).toEqual(sampleTokens);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
