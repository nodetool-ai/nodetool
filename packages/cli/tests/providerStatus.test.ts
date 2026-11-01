import { describe, expect, it } from "vitest";
import {
  getRegisteredProvider,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import { KEYED_PROVIDERS } from "../src/lean/providerStatus.js";

/** Credentials the runtime needs before it builds each keyed provider. */
function runtimeCredentials(): Map<string, string[]> {
  const credentials = new Map<string, string[]>();
  for (const id of listRegisteredProviderIds()) {
    // Credential names are upper snake case. Lower-case kwargs are flags.
    const keys = Object.keys(getRegisteredProvider(id)?.kwargs ?? {}).filter(
      (key) => /^[A-Z][A-Z0-9_]*$/.test(key)
    );
    if (keys.length > 0) credentials.set(id, keys.sort());
  }
  return credentials;
}

describe("lean provider credential table", () => {
  it("matches the runtime registry", () => {
    const runtime = runtimeCredentials();
    expect(runtime.size).toBeGreaterThan(10);
    const lean = new Map(
      KEYED_PROVIDERS.map((provider) => [provider.id, [...provider.credentials].sort()])
    );
    expect(Object.fromEntries(lean)).toEqual(Object.fromEntries(runtime));
  });
});
