import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The builtin registry backs node calls from sandboxed code, so it must drop
 * the node types the server's own registry drops. It is built once per module
 * instance, so each case loads a fresh copy under its environment.
 */
async function freshRegistry() {
  vi.resetModules();
  const { buildBuiltinRegistry } = await import("../src/registry.js");
  return buildBuiltinRegistry();
}

describe("buildBuiltinRegistry node policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps host-filesystem nodes on a local install", async () => {
    vi.stubEnv("NODETOOL_ENV", "");
    vi.stubEnv("NODETOOL_NODE_PROFILE", "");
    const registry = await freshRegistry();
    expect(registry.has("nodetool.document.LoadDocumentFile")).toBe(true);
    expect(registry.has("nodetool.text.Concat")).toBe(true);
  }, 180_000);

  it("drops nodes outside the cloud profile", async () => {
    vi.stubEnv("NODETOOL_NODE_PROFILE", "cloud");
    const registry = await freshRegistry();
    expect(registry.has("nodetool.document.LoadDocumentFile")).toBe(false);
    expect(registry.has("nodetool.text.LoadTextFolder")).toBe(false);
    expect(registry.has("nodetool.text.Concat")).toBe(true);
  }, 180_000);
});
