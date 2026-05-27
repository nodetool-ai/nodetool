const electronMock = jest.requireActual("../../../__mocks__/electron");
jest.mock("electron", () => electronMock);
jest.mock("../../../utils", () => ({ fileExists: jest.fn() }));
jest.mock("../../../logger", () => ({ logMessage: jest.fn() }));
jest.mock("../../../events", () => ({ emitServerLog: jest.fn() }));
jest.mock("../../../config", () => ({
  getProcessEnv: jest.fn().mockReturnValue({})
}));
jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
  access: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn()
}));
jest.mock("child_process", () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn()
}));

import { NpmRuntimePackage } from "../NpmRuntimePackage";
import { fileExists } from "../../../utils";
import * as fsp from "fs/promises";
import type { RuntimeContext } from "../types";

const mockFileExists = fileExists as jest.MockedFunction<typeof fileExists>;
const mockReadFile = fsp.readFile as jest.MockedFunction<typeof fsp.readFile>;

const ctx: RuntimeContext = {
  condaEnvPath: "/mock/conda",
  userDataDir: "/mock/userData",
  optionalNodeRoot: "/mock/optional",
  platform: "linux",
  arch: "x64",
  log: jest.fn()
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
