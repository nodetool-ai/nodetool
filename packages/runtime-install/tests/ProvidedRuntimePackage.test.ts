import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";
vi.mock("../src/fs.js", () => ({ fileExists: vi.fn() }));

import { ProvidedRuntimePackage } from "../src/packages/ProvidedRuntimePackage.js";
import type { RuntimeContext } from "../src/packages/types.js";
import { fileExists } from "../src/fs.js";

const mockFileExists = vi.mocked(fileExists);

const ctx: RuntimeContext = {
  host: fakeHost(),
  condaEnvPath: "/mock/conda",
  userDataDir: "/mock/userData",
  optionalNodeRoot: "/mock/optional",
  platform: "linux",
  arch: "x64",
  log: vi.fn()
};

describe("ProvidedRuntimePackage", () => {
  const pkg = new ProvidedRuntimePackage({
    id: "test-pkg",
    name: "Test Package",
    description: "A test package",
    category: "language",
    versionRange: "*",
    binaries: {
      node: (c) =>
        c.platform === "win32"
          ? `${c.condaEnvPath}/node.exe`
          : `${c.condaEnvPath}/bin/node`
    }
  });

  beforeEach(() => {
    mockFileExists.mockReset();
  });

  describe("status", () => {
    it("always reports installed", async () => {
      const status = await pkg.status(ctx);
      expect(status).toEqual({ installed: true, bundled: true });
    });
  });

  describe("install", () => {
    it("yields done immediately", async () => {
      const events: unknown[] = [];
      const signal = new AbortController().signal;
      for await (const event of pkg.install(ctx, signal)) {
        events.push(event);
      }
      expect(events).toEqual([{ type: "done" }]);
    });
  });

  describe("update", () => {
    it("yields done immediately", async () => {
      const events: unknown[] = [];
      const signal = new AbortController().signal;
      for await (const event of pkg.update(ctx, signal)) {
        events.push(event);
      }
      expect(events).toEqual([{ type: "done" }]);
    });
  });

  describe("repair", () => {
    it("yields done immediately", async () => {
      const events: unknown[] = [];
      const signal = new AbortController().signal;
      for await (const event of pkg.repair(ctx, signal)) {
        events.push(event);
      }
      expect(events).toEqual([{ type: "done" }]);
    });
  });

  describe("uninstall", () => {
    it("is a no-op", async () => {
      await expect(pkg.uninstall(ctx)).resolves.toBeUndefined();
    });
  });

  describe("resolve", () => {
    it("returns binaries and binPaths when file exists", async () => {
      mockFileExists.mockResolvedValue(true);
      const result = await pkg.resolve(ctx);
      expect(result).not.toBeNull();
      expect(result!.binaries).toEqual({ node: "/mock/conda/bin/node" });
      expect(result!.binPaths).toEqual(["/mock/conda/bin"]);
    });

    it("returns empty when binary file does not exist", async () => {
      mockFileExists.mockResolvedValue(false);
      const result = await pkg.resolve(ctx);
      expect(result).not.toBeNull();
      expect(result!.binaries).toBeUndefined();
      expect(result!.binPaths).toBeUndefined();
    });
  });

  describe("constructor", () => {
    it("stores id, name, description, and category", () => {
      expect(pkg.id).toBe("test-pkg");
      expect(pkg.name).toBe("Test Package");
      expect(pkg.description).toBe("A test package");
      expect(pkg.category).toBe("language");
    });

    it("defaults to no binaries when not provided", async () => {
      const bare = new ProvidedRuntimePackage({
        id: "bare",
        name: "Bare",
        description: "No binaries",
        category: "tool",
        versionRange: "*"
      });
      const result = await bare.resolve(ctx);
      expect(result!.binaries).toBeUndefined();
    });
  });
});
