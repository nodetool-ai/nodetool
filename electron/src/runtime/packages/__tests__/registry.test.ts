import type {
  RuntimeContext,
  RuntimePackage,
  RuntimeProgress,
  RuntimeResolution,
  RuntimeStatus
} from "../types";

jest.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: jest.fn().mockReturnValue("/mock/userData")
  }
}));

jest.mock("../../../logger", () => ({
  logMessage: jest.fn()
}));

jest.mock("../../../config", () => ({
  getCondaEnvPath: jest.fn().mockReturnValue("/mock/conda"),
  getOptionalNodeModulesPath: jest.fn().mockReturnValue("/mock/optional/node_modules")
}));

const mockPkg: RuntimePackage = {
  id: "test-runtime",
  name: "Test Runtime",
  description: "A test runtime",
  category: "tool",
  versionRange: ">=1.0.0",
  status: jest.fn(),
  install: jest.fn(),
  update: jest.fn(),
  repair: jest.fn(),
  uninstall: jest.fn(),
  resolve: jest.fn()
};

const mockPkgWithDep: RuntimePackage = {
  id: "dep-runtime",
  name: "Dep Runtime",
  description: "A dependent runtime",
  category: "tool",
  versionRange: ">=1.0.0",
  dependsOn: ["test-runtime"],
  status: jest.fn(),
  install: jest.fn(),
  update: jest.fn(),
  repair: jest.fn(),
  uninstall: jest.fn(),
  resolve: jest.fn()
};

jest.mock("../definitions", () => ({
  RUNTIME_PACKAGES: {
    "test-runtime": mockPkg,
    "dep-runtime": mockPkgWithDep
  }
}));

describe("RuntimeRegistry", () => {
  let registry: typeof import("../registry").runtimeRegistry;
  let RUNTIME_PACKAGE_IDS: typeof import("../registry").RUNTIME_PACKAGE_IDS;

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockPkg.status as jest.Mock).mockResolvedValue({ installed: true });
    (mockPkg.resolve as jest.Mock).mockResolvedValue({ binPaths: ["/bin"] });
    (mockPkg.uninstall as jest.Mock).mockResolvedValue(undefined);
    (mockPkgWithDep.status as jest.Mock).mockResolvedValue({ installed: false });

    const mod = await import("../registry");
    registry = mod.runtimeRegistry;
    RUNTIME_PACKAGE_IDS = mod.RUNTIME_PACKAGE_IDS;
  });

  describe("RUNTIME_PACKAGE_IDS", () => {
    it("lists all registered package ids", () => {
      expect(RUNTIME_PACKAGE_IDS).toContain("test-runtime");
      expect(RUNTIME_PACKAGE_IDS).toContain("dep-runtime");
    });
  });

  describe("list", () => {
    it("returns all packages for the current platform", () => {
      const items = registry.list();
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.find((i) => (i.id as string) === "test-runtime")).toBeDefined();
    });
  });

  describe("get", () => {
    it("returns a package by id", () => {
      expect(registry.get("test-runtime" as never)).toBe(mockPkg);
    });

    it("returns undefined for unknown id", () => {
      expect(registry.get("nonexistent" as never)).toBeUndefined();
    });
  });

  describe("isInstalling", () => {
    it("returns false when nothing is in progress", () => {
      expect(registry.isInstalling("test-runtime" as never)).toBe(false);
    });
  });

  describe("status", () => {
    it("probes a single package status", async () => {
      const result = await registry.status("test-runtime" as never);
      expect(result.id).toBe("test-runtime");
      expect(result.installed).toBe(true);
    });

    it("returns not-installed for unknown package", async () => {
      const result = await registry.status("nonexistent" as never);
      expect(result.installed).toBe(false);
    });
  });

  describe("statuses", () => {
    it("probes all listed packages", async () => {
      const results = await registry.statuses();
      expect(results.length).toBeGreaterThanOrEqual(1);
      const ids = results.map((r) => r.id);
      expect(ids).toContain("test-runtime");
    });
  });

  describe("resolve", () => {
    it("returns resolution for a known package", async () => {
      const result = await registry.resolve("test-runtime" as never);
      expect(result).toEqual({ binPaths: ["/bin"] });
    });

    it("returns null for unknown package", async () => {
      const result = await registry.resolve("nonexistent" as never);
      expect(result).toBeNull();
    });
  });

  describe("cancel", () => {
    it("returns false when nothing is in progress", () => {
      expect(registry.cancel("test-runtime" as never)).toBe(false);
    });
  });

  describe("uninstall", () => {
    it("calls uninstall on the package", async () => {
      await registry.uninstall("test-runtime" as never);
      expect(mockPkg.uninstall).toHaveBeenCalledTimes(1);
    });

    it("throws for unknown package", async () => {
      await expect(
        registry.uninstall("nonexistent" as never)
      ).rejects.toThrow("Unknown runtime");
    });
  });

  describe("runLifecycle", () => {
    it("yields error for unknown package", async () => {
      const events: RuntimeProgress[] = [];
      for await (const ev of registry.runLifecycle(
        "nonexistent" as never,
        "install"
      )) {
        events.push(ev);
      }
      expect(events).toEqual([
        { type: "error", message: "Unknown runtime: nonexistent" }
      ]);
    });

    it("yields error when a dependency is not installed", async () => {
      (mockPkg.status as jest.Mock).mockResolvedValue({ installed: false });

      const events: RuntimeProgress[] = [];
      for await (const ev of registry.runLifecycle(
        "dep-runtime" as never,
        "install"
      )) {
        events.push(ev);
      }
      expect(events[0]).toEqual(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("requires test-runtime")
        })
      );
    });

    it("runs install lifecycle and yields events", async () => {
      async function* fakeInstall(): AsyncIterable<RuntimeProgress> {
        yield { type: "stage", label: "downloading" };
        yield { type: "percent", value: 50 };
        yield { type: "done" };
      }
      (mockPkg.install as jest.Mock).mockReturnValue(fakeInstall());

      const events: RuntimeProgress[] = [];
      for await (const ev of registry.runLifecycle(
        "test-runtime" as never,
        "install"
      )) {
        events.push(ev);
      }
      expect(events).toEqual([
        { type: "stage", label: "downloading" },
        { type: "percent", value: 50 },
        { type: "done" }
      ]);
    });
  });
});
