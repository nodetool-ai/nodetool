/**
 * The server compiles where it already is async, and degrades by name when it
 * cannot.
 *
 * A compiler that will not load must not cost the server its catalog: the packs
 * still discover, npm modules stay `pending-compile`, and the reason shows up
 * in the diagnostics the Package Manager reads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const compileSandboxCatalog = vi.fn();
const discoverSandboxCatalog = vi.fn();
const setProcessSandboxModuleCatalog = vi.fn();

vi.mock("@nodetool-ai/sandbox-compiler", () => ({
  compileSandboxCatalog: (options: unknown) => compileSandboxCatalog(options)
}));
vi.mock("@nodetool-ai/node-sdk", () => ({
  discoverSandboxCatalog: (...args: unknown[]) => discoverSandboxCatalog(...args)
}));
vi.mock("@nodetool-ai/runtime", () => ({
  setProcessSandboxModuleCatalog: (catalog: unknown) =>
    setProcessSandboxModuleCatalog(catalog)
}));

const catalogHost = (label: string) => ({
  catalog: { diagnostics: () => [{ packName: label, status: "ready", code: "ok", message: label }] },
  discoveries: [],
  failures: []
});

async function loadModule() {
  vi.resetModules();
  return import("../src/sandbox-catalog.js");
}

beforeEach(() => {
  compileSandboxCatalog.mockReset();
  discoverSandboxCatalog.mockReset();
  setProcessSandboxModuleCatalog.mockReset();
});

describe("refreshSandboxCatalog", () => {
  it("uses the compiling host and installs it as the process default", async () => {
    compileSandboxCatalog.mockResolvedValueOnce({ ...catalogHost("compiled"), compiled: [] });
    const module = await loadModule();

    const host = await module.refreshSandboxCatalog(["/packs"]);

    expect(compileSandboxCatalog).toHaveBeenCalledWith({ searchPaths: ["/packs"] });
    expect(discoverSandboxCatalog).not.toHaveBeenCalled();
    expect(setProcessSandboxModuleCatalog).toHaveBeenCalledWith(host.catalog);
    expect(module.getSandboxCatalog()).toBe(host.catalog);
    expect(module.getSandboxCatalogDiagnostics()).toHaveLength(1);
  });

  it("falls back to plain discovery and says why when compiling throws", async () => {
    compileSandboxCatalog.mockRejectedValueOnce(new Error("esbuild is missing"));
    discoverSandboxCatalog.mockReturnValueOnce(catalogHost("discovered"));
    const module = await loadModule();

    await module.refreshSandboxCatalog();

    expect(discoverSandboxCatalog).toHaveBeenCalled();
    const diagnostics = module.getSandboxCatalogDiagnostics();
    const failure = diagnostics.find((entry) => entry.code === "compile-failed");
    expect(failure?.status).toBe("warning");
    expect(failure?.message).toContain("esbuild is missing");
  });

  it("clears a previous failure on the next successful refresh", async () => {
    compileSandboxCatalog.mockRejectedValueOnce(new Error("first attempt"));
    discoverSandboxCatalog.mockReturnValueOnce(catalogHost("discovered"));
    const module = await loadModule();
    await module.refreshSandboxCatalog();
    expect(module.getSandboxCatalogDiagnostics()).toHaveLength(2);

    compileSandboxCatalog.mockResolvedValueOnce({ ...catalogHost("compiled"), compiled: [] });
    await module.refreshSandboxCatalog();
    expect(module.getSandboxCatalogDiagnostics()).toHaveLength(1);
  });
});
