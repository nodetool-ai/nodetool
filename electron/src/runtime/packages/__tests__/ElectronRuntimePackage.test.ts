const electronMock = jest.requireActual("../../../__mocks__/electron");
jest.mock("electron", () => electronMock);
jest.mock("../../../utils", () => ({ fileExists: jest.fn() }));

import { ElectronRuntimePackage } from "../ElectronRuntimePackage";
import type { RuntimeContext } from "../types";
import { fileExists } from "../../../utils";

const mockFileExists = fileExists as jest.MockedFunction<typeof fileExists>;

const ctx: RuntimeContext = {
  condaEnvPath: "/mock/conda",
  userDataDir: "/mock/userData",
  optionalNodeRoot: "/mock/optional",
  platform: "linux",
  arch: "x64",
  log: jest.fn()
};

describe("ElectronRuntimePackage", () => {
  const pkg = new ElectronRuntimePackage({
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
      expect(status.installed).toBe(true);
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
      const bare = new ElectronRuntimePackage({
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
