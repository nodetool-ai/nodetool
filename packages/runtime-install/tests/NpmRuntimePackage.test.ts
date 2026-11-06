import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn()
}));
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn()
}));
vi.mock("../src/fs.js", () => ({ fileExists: vi.fn() }));

import { NpmRuntimePackage } from "../src/packages/NpmRuntimePackage.js";
import { fileExists } from "../src/fs.js";

// Only the filesystem probe and reads are stubbed.
const mockFileExists = vi.mocked(fileExists);
import * as fsp from "node:fs/promises";
import type { RuntimeContext } from "../src/packages/types.js";

const mockReadFile = vi.mocked(fsp.readFile);

const ctx: RuntimeContext = {
  host: fakeHost(),
  condaEnvPath: "/mock/conda",
  userDataDir: "/mock/userData",
  optionalNodeRoot: "/mock/optional",
  platform: "linux",
  arch: "x64",
  log: vi.fn()
};

describe("NpmRuntimePackage", () => {
  const pkg = new NpmRuntimePackage({
    id: "test-npm",
    name: "Test NPM Package",
    description: "A test npm package",
    category: "library",
    versionRange: "^3.0.0",
    npmPackages: ["@huggingface/transformers@3.0.0"],
    packageNames: ["@huggingface/transformers"]
  });

  beforeEach(() => {
    mockFileExists.mockReset();
    mockReadFile.mockReset();
  });

  describe("constructor", () => {
    it("stores id, name, and npm package info", () => {
      expect(pkg.id).toBe("test-npm");
      expect(pkg.name).toBe("Test NPM Package");
      expect(pkg.npmPackages).toEqual(["@huggingface/transformers@3.0.0"]);
      expect(pkg.packageNames).toEqual(["@huggingface/transformers"]);
    });
  });

  describe("status", () => {
    it("returns not installed when package.json does not exist", async () => {
      mockFileExists.mockResolvedValue(false);
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(false);
    });

    it("returns installed with version info when package exists", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: "3.0.0" }) as never
      );
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(true);
      expect(status.installedVersion).toBe("3.0.0");
      expect(status.latestVersion).toBe("3.0.0");
      expect(status.updateAvailable).toBe(false);
    });

    it("reports updateAvailable when versions differ", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: "2.9.0" }) as never
      );
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(true);
      expect(status.installedVersion).toBe("2.9.0");
      expect(status.latestVersion).toBe("3.0.0");
      expect(status.updateAvailable).toBe(true);
    });

    it("reports brokenReason when only some packages exist", async () => {
      const multi = new NpmRuntimePackage({
        id: "multi",
        name: "Multi",
        description: "Multi-package",
        category: "library",
        versionRange: "*",
        npmPackages: ["pkg-a@1.0.0", "pkg-b@1.0.0"],
        packageNames: ["pkg-a", "pkg-b"]
      });
      mockFileExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const status = await multi.status(ctx);
      expect(status.installed).toBe(true);
      expect(status.brokenReason).toContain("pkg-b");
    });
  });

  describe("resolve", () => {
    it("returns nodeModulePaths when installed", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: "3.0.0" }) as never
      );
      const result = await pkg.resolve(ctx);
      expect(result).not.toBeNull();
      expect(result!.nodeModulePaths).toEqual([
        "/mock/optional/node_modules"
      ]);
    });

    it("returns null when not installed", async () => {
      mockFileExists.mockResolvedValue(false);
      const result = await pkg.resolve(ctx);
      expect(result).toBeNull();
    });
  });
});
