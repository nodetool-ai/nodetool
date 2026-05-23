import { ElectronRuntimePackage } from "../ElectronRuntimePackage";
import type { RuntimeContext } from "../types";

jest.mock("../../../utils", () => ({
  fileExists: jest.fn()
}));

import { fileExists } from "../../../utils";

const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;

function makeCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    userDataDir: "/tmp/test-userdata",
    condaEnvPath: "/tmp/test-conda",
    optionalNodeRoot: "/tmp/test-node-root",
    platform: "linux",
    arch: "x64",
    log: jest.fn(),
    ...overrides
  };
}

describe("ElectronRuntimePackage", () => {
  const defaultOpts = {
    id: "test-runtime",
    name: "Test Runtime",
    description: "A test runtime package",
    category: "tool" as const,
    versionRange: ">=1.0.0"
  };

  beforeEach(() => {
    mockedFileExists.mockReset();
  });

  it("stores constructor options as properties", () => {
    const pkg = new ElectronRuntimePackage({
      ...defaultOpts,
      approxSizeMB: 50,
      homepage: "https://example.com"
    });
    expect(pkg.id).toBe("test-runtime");
    expect(pkg.name).toBe("Test Runtime");
    expect(pkg.description).toBe("A test runtime package");
    expect(pkg.category).toBe("tool");
    expect(pkg.versionRange).toBe(">=1.0.0");
    expect(pkg.approxSizeMB).toBe(50);
    expect(pkg.homepage).toBe("https://example.com");
  });

  it("status always returns installed: true", async () => {
    const pkg = new ElectronRuntimePackage(defaultOpts);
    const status = await pkg.status(makeCtx());
    expect(status.installed).toBe(true);
  });

  it("install yields done immediately", async () => {
    const pkg = new ElectronRuntimePackage(defaultOpts);
    const events = [];
    for await (const ev of pkg.install(makeCtx(), new AbortController().signal)) {
      events.push(ev);
    }
    expect(events).toEqual([{ type: "done" }]);
  });

  it("update yields done immediately", async () => {
    const pkg = new ElectronRuntimePackage(defaultOpts);
    const events = [];
    for await (const ev of pkg.update(makeCtx(), new AbortController().signal)) {
      events.push(ev);
    }
    expect(events).toEqual([{ type: "done" }]);
  });

  it("repair yields done immediately", async () => {
    const pkg = new ElectronRuntimePackage(defaultOpts);
    const events = [];
    for await (const ev of pkg.repair(makeCtx(), new AbortController().signal)) {
      events.push(ev);
    }
    expect(events).toEqual([{ type: "done" }]);
  });

  it("uninstall is a no-op", async () => {
    const pkg = new ElectronRuntimePackage(defaultOpts);
    await expect(pkg.uninstall(makeCtx())).resolves.toBeUndefined();
  });

  describe("resolve", () => {
    it("returns empty resolution when no binaries are configured", async () => {
      const pkg = new ElectronRuntimePackage(defaultOpts);
      const resolution = await pkg.resolve(makeCtx());
      expect(resolution).toEqual({
        binaries: undefined,
        binPaths: undefined
      });
    });

    it("returns resolved binaries when files exist", async () => {
      mockedFileExists.mockResolvedValue(true);
      const pkg = new ElectronRuntimePackage({
        ...defaultOpts,
        binaries: {
          node: () => "/usr/local/bin/node",
          npm: () => "/usr/local/bin/npm"
        }
      });

      const resolution = await pkg.resolve(makeCtx());
      expect(resolution?.binaries).toEqual({
        node: "/usr/local/bin/node",
        npm: "/usr/local/bin/npm"
      });
      expect(resolution?.binPaths).toContain("/usr/local/bin");
    });

    it("excludes binaries when files do not exist", async () => {
      mockedFileExists.mockResolvedValue(false);
      const pkg = new ElectronRuntimePackage({
        ...defaultOpts,
        binaries: {
          node: () => "/usr/local/bin/node"
        }
      });

      const resolution = await pkg.resolve(makeCtx());
      expect(resolution?.binaries).toBeUndefined();
      expect(resolution?.binPaths).toBeUndefined();
    });

    it("excludes binaries when resolver returns undefined", async () => {
      const pkg = new ElectronRuntimePackage({
        ...defaultOpts,
        binaries: {
          node: () => undefined
        }
      });

      const resolution = await pkg.resolve(makeCtx());
      expect(resolution?.binaries).toBeUndefined();
    });

    it("deduplicates binPaths", async () => {
      mockedFileExists.mockResolvedValue(true);
      const pkg = new ElectronRuntimePackage({
        ...defaultOpts,
        binaries: {
          node: () => "/usr/local/bin/node",
          npx: () => "/usr/local/bin/npx"
        }
      });

      const resolution = await pkg.resolve(makeCtx());
      expect(resolution?.binPaths).toHaveLength(1);
      expect(resolution?.binPaths).toEqual(["/usr/local/bin"]);
    });
  });
});
