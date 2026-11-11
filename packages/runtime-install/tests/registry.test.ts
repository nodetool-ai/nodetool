import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";
import type { RuntimePackage, RuntimeProgress } from "../src/packages/types.js";
import { RuntimeRegistry } from "../src/packages/registry.js";

const { mockPkg, mockPkgWithDep } = vi.hoisted(() => {
  const fns = () => ({
    status: vi.fn(),
    install: vi.fn(),
    update: vi.fn(),
    repair: vi.fn(),
    uninstall: vi.fn(),
    resolve: vi.fn()
  });
  const mockPkg = {
    id: "test-runtime",
    name: "Test Runtime",
    description: "A test runtime",
    category: "tool",
    versionRange: ">=1.0.0",
    ...fns()
  } as RuntimePackage;
  const mockPkgWithDep = {
    id: "dep-runtime",
    name: "Dep Runtime",
    description: "A dependent runtime",
    category: "tool",
    versionRange: ">=1.0.0",
    dependsOn: ["test-runtime"],
    ...fns()
  } as RuntimePackage;
  return { mockPkg, mockPkgWithDep };
});

vi.mock("../src/packages/definitions.js", () => ({
  RUNTIME_PACKAGES: {
    "test-runtime": mockPkg,
    "dep-runtime": mockPkgWithDep
  }
}));

describe("RuntimeRegistry", () => {
  let registry: RuntimeRegistry;
  let RUNTIME_PACKAGE_IDS: typeof import("../src/packages/registry.js").RUNTIME_PACKAGE_IDS;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(mockPkg.status).mockResolvedValue({ installed: true });
    vi.mocked(mockPkg.resolve).mockResolvedValue({ binPaths: ["/bin"] });
    vi.mocked(mockPkg.uninstall).mockResolvedValue(undefined);
    vi.mocked(mockPkgWithDep.status).mockResolvedValue({ installed: false });

    const mod = await import("../src/packages/registry.js");
    registry = new RuntimeRegistry(fakeHost());
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
      vi.mocked(mockPkg.status).mockResolvedValue({ installed: false });

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
      vi.mocked(mockPkg.install).mockReturnValue(fakeInstall());

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
