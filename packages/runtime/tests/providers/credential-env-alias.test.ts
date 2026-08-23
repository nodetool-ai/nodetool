import { describe, it, expect, afterEach } from "vitest";
import {
  registerProvider,
  getProvider,
  isProviderConfigured,
  readCredentialEnv,
  resolveCredentialValue,
  unregisterProvider
} from "../../src/providers/provider-registry.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";

class KwargCapturingProvider extends FakeProvider {
  receivedOptions: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    super();
    this.receivedOptions = options;
  }
}

const noSecrets = async () => undefined;

const ENV_KEYS = ["FAL_API_KEY", "FAL_KEY"] as const;
const saved: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("credential env aliases", () => {
  it("reads the registered key when it is set", () => {
    process.env.FAL_API_KEY = "canonical";
    process.env.FAL_KEY = "alias";
    expect(readCredentialEnv("FAL_API_KEY")).toBe("canonical");
  });

  // fal's own SDK reads FAL_KEY, so a machine configured for it looked
  // unconfigured to NodeTool and every call failed with a 401.
  it("falls back to the vendor's own variable name", () => {
    delete process.env.FAL_API_KEY;
    process.env.FAL_KEY = "alias";
    expect(readCredentialEnv("FAL_API_KEY")).toBe("alias");
  });

  it("returns undefined when neither is set", () => {
    delete process.env.FAL_API_KEY;
    delete process.env.FAL_KEY;
    expect(readCredentialEnv("FAL_API_KEY")).toBeUndefined();
  });

  it("does not invent aliases for other keys", () => {
    delete process.env.SOME_OTHER_API_KEY;
    process.env.FAL_KEY = "alias";
    expect(readCredentialEnv("SOME_OTHER_API_KEY")).toBeUndefined();
  });

  it("counts a provider configured via the alias", async () => {
    const id = `alias-test-${Date.now()}`;
    registerProvider(id, KwargCapturingProvider as never, {
      FAL_API_KEY: ""
    });
    try {
      delete process.env.FAL_API_KEY;
      process.env.FAL_KEY = "alias";
      expect(await isProviderConfigured(id, noSecrets)).toBe(true);
    } finally {
      unregisterProvider(id);
    }
  });

  it("resolves the same alias value used by provider construction", async () => {
    delete process.env.FAL_API_KEY;
    process.env.FAL_KEY = "alias";
    await expect(
      resolveCredentialValue("FAL_API_KEY", noSecrets)
    ).resolves.toBe("alias");
  });

  it("does not count an empty stored value as configured", async () => {
    delete process.env.FAL_API_KEY;
    delete process.env.FAL_KEY;
    await expect(
      resolveCredentialValue("FAL_API_KEY", async () => "")
    ).resolves.toBeUndefined();
  });

  it("passes the alias value into the provider constructor", async () => {
    const id = `alias-kwarg-${Date.now()}`;
    registerProvider(id, KwargCapturingProvider as never, {
      FAL_API_KEY: ""
    });
    try {
      delete process.env.FAL_API_KEY;
      process.env.FAL_KEY = "alias";
      const provider = (await getProvider(
        id,
        noSecrets
      )) as KwargCapturingProvider;
      expect(provider.receivedOptions.FAL_API_KEY).toBe("alias");
    } finally {
      unregisterProvider(id);
    }
  });
});
