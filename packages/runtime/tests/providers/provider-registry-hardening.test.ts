/**
 * Mutation-hardening tests for the provider registry.
 *
 * Pins credential resolution order (secret → env → default), the "needs
 * resolution" predicate (empty/null value, excluding `_`-prefixed runtime
 * injections), and isProviderConfigured's required-credential check. See
 * MUTATION_TESTING.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  registerProvider,
  getProvider,
  isProviderConfigured
} from "../../src/providers/provider-registry.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";

class OptsProvider extends FakeProvider {
  opts: Record<string, unknown>;
  constructor(options: Record<string, unknown> = {}) {
    super();
    this.opts = options;
  }
}

const id = () => `pr-hard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const noSecrets = async () => undefined;
const touchedEnv: string[] = [];

afterEach(() => {
  for (const k of touchedEnv.splice(0)) delete process.env[k];
});

describe("getProvider — required kwargs resolution", () => {
  it("does NOT overwrite a kwarg that already has a value", async () => {
    const p = id();
    registerProvider(p, OptsProvider as never, { TEXT: "preset" });
    const prov = (await getProvider(p, async () => "secret")) as OptsProvider;
    expect(prov.opts.TEXT).toBe("preset");
  });

  it("preserves an unresolved empty kwarg (does not blank it to undefined)", async () => {
    const p = id();
    registerProvider(p, OptsProvider as never, { EMPTY_K: "" });
    const prov = (await getProvider(p, noSecrets)) as OptsProvider;
    expect(prov.opts.EMPTY_K).toBe("");
  });

  it("resolves via getSecret before env", async () => {
    const p = id();
    const key = `K_${Date.now()}`;
    process.env[key] = "from-env";
    touchedEnv.push(key);
    registerProvider(p, OptsProvider as never, { [key]: undefined });
    const prov = (await getProvider(p, async () => "from-secret")) as OptsProvider;
    expect(prov.opts[key]).toBe("from-secret");
  });
});

describe("getProvider — optionalKwargs resolution order", () => {
  it("uses the registered default when neither secret nor env resolves", async () => {
    const p = id();
    registerProvider(p, OptsProvider as never, {}, { URL: "http://default" });
    const prov = (await getProvider(p, noSecrets)) as OptsProvider;
    expect(prov.opts.URL).toBe("http://default");
  });

  it("prefers a resolved secret over the default", async () => {
    const p = id();
    registerProvider(p, OptsProvider as never, {}, { URL: "http://default" });
    const prov = (await getProvider(
      p,
      async () => "http://secret"
    )) as OptsProvider;
    expect(prov.opts.URL).toBe("http://secret");
  });

  it("prefers an env value over the default when no secret", async () => {
    const p = id();
    const key = `OPT_${Date.now()}`;
    process.env[key] = "http://env";
    touchedEnv.push(key);
    registerProvider(p, OptsProvider as never, {}, { [key]: "http://default" });
    const prov = (await getProvider(p, noSecrets)) as OptsProvider;
    expect(prov.opts[key]).toBe("http://env");
  });
});

describe("isProviderConfigured", () => {
  it("returns false for an unregistered provider", async () => {
    expect(await isProviderConfigured("never-registered-x", noSecrets)).toBe(
      false
    );
  });

  it("ignores `_`-prefixed injections and already-valued kwargs", async () => {
    const p = id();
    registerProvider(p, OptsProvider as never, {
      _internal: undefined, // runtime injection — must NOT be required
      PRESET: "already-here", // has a value — must NOT be required
      NEEDED: undefined // the only real required credential
    });
    const resolveNeeded = async (k: string) =>
      k === "NEEDED" ? "ok" : undefined;
    expect(await isProviderConfigured(p, resolveNeeded)).toBe(true);
  });

  it("resolves a required credential from env when the secret resolver misses", async () => {
    const p = id();
    const key = `REQ_${Date.now()}`;
    registerProvider(p, OptsProvider as never, { [key]: undefined });
    process.env[key] = "env-cred";
    touchedEnv.push(key);
    expect(await isProviderConfigured(p, noSecrets)).toBe(true);
  });

  it("returns false when a required credential cannot be resolved", async () => {
    const p = id();
    registerProvider(p, OptsProvider as never, { MISSING_K: undefined });
    expect(await isProviderConfigured(p, noSecrets)).toBe(false);
  });

  it("treats an empty-string kwarg as a required (unresolved) credential", async () => {
    // value === "" must count as needing resolution, distinct from `== null`.
    const p = id();
    registerProvider(p, OptsProvider as never, { EMPTY_STR: "" });
    expect(await isProviderConfigured(p, noSecrets)).toBe(false);
  });
});
