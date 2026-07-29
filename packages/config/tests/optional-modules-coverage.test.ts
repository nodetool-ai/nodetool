/**
 * Coverage tests for the optional-module loader (src/optional-modules.ts).
 *
 * We mock ../src/node-import.js so we control IS_NODE, importHidden, and
 * importNodeBuiltin — the loader's only external effects — and never touch
 * the real module graph or filesystem.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from "vitest";

const h = vi.hoisted(() => ({
  state: { isNode: true },
  importHidden: vi.fn(),
  importNodeBuiltin: vi.fn()
}));

vi.mock("../src/node-import.js", () => ({
  get IS_NODE() {
    return h.state.isNode;
  },
  importHidden: h.importHidden,
  importNodeBuiltin: h.importNodeBuiltin
}));

import { importOptionalModule } from "../src/optional-modules.js";

describe("importOptionalModule", () => {
  const savedEnv = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];

  beforeEach(() => {
    h.state.isNode = true;
    h.importHidden.mockReset();
    h.importNodeBuiltin.mockReset();
    delete process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    } else {
      process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = savedEnv;
    }
  });

  it("returns the module when importHidden resolves it (present module)", async () => {
    const fakeModule = { hello: "world", fn: () => 42 };
    h.importHidden.mockResolvedValueOnce(fakeModule);

    const result = await importOptionalModule<typeof fakeModule>("some-pkg");

    expect(result).toBe(fakeModule);
    expect(h.importHidden).toHaveBeenCalledWith("some-pkg");
    expect(h.importHidden).toHaveBeenCalledTimes(1);
  });

  it("throws an 'unavailable on non-Node' error when importHidden returns null and no fallback env is set", async () => {
    h.importHidden.mockResolvedValueOnce(null);
    // IS_NODE true but no NODETOOL_OPTIONAL_NODE_MODULES → rethrow.
    await expect(importOptionalModule("ghost-pkg")).rejects.toThrow(
      /ghost-pkg unavailable on non-Node/
    );
  });

  it("rethrows the original import error on non-Node runtimes (no fallback attempted)", async () => {
    h.state.isNode = false;
    const boom = new Error("cannot resolve on edge");
    h.importHidden.mockRejectedValueOnce(boom);

    await expect(importOptionalModule("edge-pkg")).rejects.toBe(boom);
    // Fallback path must not have been attempted.
    expect(h.importNodeBuiltin).not.toHaveBeenCalled();
  });

  it("rethrows the original error on Node when the fallback env var is absent", async () => {
    const boom = new Error("not found in graph");
    h.importHidden.mockRejectedValueOnce(boom);

    await expect(importOptionalModule("missing-pkg")).rejects.toBe(boom);
    expect(h.importNodeBuiltin).not.toHaveBeenCalled();
  });

  it("loads the module from the optional node_modules fallback when the primary import fails", async () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = "/opt/nm";
    const boom = new Error("primary miss");
    const resolvedModule = { fromFallback: true };

    // First importHidden (primary) fails; second (file URL) succeeds.
    h.importHidden
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce(resolvedModule);

    const resolve = vi.fn().mockReturnValue("/opt/nm/pkg/index.js");
    const createRequire = vi.fn().mockReturnValue({ resolve });
    const join = vi.fn((...parts: string[]) => parts.join("/"));
    const pathToFileURL = vi
      .fn()
      .mockReturnValue({ href: "file:///opt/nm/pkg/index.js" });

    h.importNodeBuiltin
      .mockResolvedValueOnce({ createRequire }) // node:module
      .mockResolvedValueOnce({ join }) // node:path
      .mockResolvedValueOnce({ pathToFileURL }); // node:url

    const result = await importOptionalModule<typeof resolvedModule>("pkg");

    expect(result).toBe(resolvedModule);
    expect(join).toHaveBeenCalledWith("/opt/nm", "..", "package.json");
    expect(createRequire).toHaveBeenCalledWith("/opt/nm/../package.json");
    expect(resolve).toHaveBeenCalledWith("pkg");
    expect(pathToFileURL).toHaveBeenCalledWith("/opt/nm/pkg/index.js");
    expect(h.importHidden).toHaveBeenLastCalledWith(
      "file:///opt/nm/pkg/index.js"
    );
  });

  it("rethrows the original error when a required node builtin is unavailable in the fallback", async () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = "/opt/nm";
    const boom = new Error("primary miss");
    h.importHidden.mockRejectedValueOnce(boom);

    // node:module resolves, but node:path comes back null → fallback aborts.
    h.importNodeBuiltin
      .mockResolvedValueOnce({ createRequire: vi.fn() })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ pathToFileURL: vi.fn() });

    await expect(importOptionalModule("pkg")).rejects.toBe(boom);
  });

  it("rethrows the original error when the resolved file module is null", async () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = "/opt/nm";
    const boom = new Error("primary miss");

    h.importHidden
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce(null); // file URL import yields null

    const resolve = vi.fn().mockReturnValue("/opt/nm/pkg/index.js");
    h.importNodeBuiltin
      .mockResolvedValueOnce({ createRequire: vi.fn().mockReturnValue({ resolve }) })
      .mockResolvedValueOnce({ join: (...p: string[]) => p.join("/") })
      .mockResolvedValueOnce({
        pathToFileURL: vi.fn().mockReturnValue({ href: "file:///x" })
      });

    await expect(importOptionalModule("pkg")).rejects.toBe(boom);
  });

  it("rethrows the original error when require.resolve throws inside the fallback", async () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = "/opt/nm";
    const boom = new Error("primary miss");
    h.importHidden.mockRejectedValueOnce(boom);

    const resolve = vi.fn(() => {
      throw new Error("MODULE_NOT_FOUND");
    });
    h.importNodeBuiltin
      .mockResolvedValueOnce({ createRequire: vi.fn().mockReturnValue({ resolve }) })
      .mockResolvedValueOnce({ join: (...p: string[]) => p.join("/") })
      .mockResolvedValueOnce({ pathToFileURL: vi.fn() });

    // The inner catch swallows MODULE_NOT_FOUND and rethrows the original.
    await expect(importOptionalModule("pkg")).rejects.toBe(boom);
  });

  it("rethrows the original error when importNodeBuiltin itself rejects in the fallback", async () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = "/opt/nm";
    const boom = new Error("primary miss");
    h.importHidden.mockRejectedValueOnce(boom);
    h.importNodeBuiltin.mockRejectedValueOnce(new Error("builtin load failed"));

    await expect(importOptionalModule("pkg")).rejects.toBe(boom);
  });
});
