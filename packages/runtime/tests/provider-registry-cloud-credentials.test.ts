import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUserCredentialKey } from "@nodetool-ai/config";

import {
  getProvider,
  isProviderConfigured,
  registerProvider,
  unregisterProvider
} from "../src/providers/provider-registry.js";
import type { BaseProvider } from "../src/providers/base-provider.js";

class RecordingProvider {
  constructor(readonly kwargs: Record<string, unknown>) {}
}

const ID = "leak_test_provider";
const KEY = "LEAK_TEST_REGISTRY_API_KEY";
const noStoredSecret = async (): Promise<null> => null;

describe("provider credentials from the server environment", () => {
  beforeEach(() => {
    registerProvider(
      ID,
      RecordingProvider as unknown as new (k: Record<string, unknown>) => BaseProvider,
      { [KEY]: "" },
      { LEAK_TEST_REGION: "default" }
    );
    process.env[KEY] = "server-key";
  });

  afterEach(() => {
    unregisterProvider(ID);
    delete process.env[KEY];
    delete process.env.NODETOOL_NODE_PROFILE;
  });

  it("registers a required credential as the user's to supply", () => {
    expect(isUserCredentialKey(KEY)).toBe(true);
    expect(isUserCredentialKey("LEAK_TEST_REGION")).toBe(false);
  });

  it("does not build the provider on the server's key on the cloud profile", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    const provider = (await getProvider(ID, noStoredSecret)) as unknown as RecordingProvider;
    expect(provider.kwargs[KEY]).toBe("");
    expect(await isProviderConfigured(ID, noStoredSecret)).toBe(false);
  });

  it("uses the user's own key on the cloud profile", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    const provider = (await getProvider(ID, async (key) =>
      key === KEY ? "user-key" : null
    )) as unknown as RecordingProvider;
    expect(provider.kwargs[KEY]).toBe("user-key");
  });

  it("uses the server's key on a self-hosted server", async () => {
    process.env.NODETOOL_NODE_PROFILE = "full";
    const provider = (await getProvider(ID, noStoredSecret)) as unknown as RecordingProvider;
    expect(provider.kwargs[KEY]).toBe("server-key");
    expect(await isProviderConfigured(ID, noStoredSecret)).toBe(true);
  });
});
