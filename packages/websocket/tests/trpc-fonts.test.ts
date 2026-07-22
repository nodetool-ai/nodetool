import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock node:fs for the filesystem-driven font listing.
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn()
  };
});

// Mock node:os for deterministic homedir + platform.
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return {
    ...actual,
    homedir: vi.fn(() => "/home/user"),
    platform: vi.fn(() => "darwin")
  };
});

import { existsSync, readdirSync } from "node:fs";
import { platform } from "node:os";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("fonts router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("returns an empty sorted list on a bare system", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.fonts.list();
      expect(result).toEqual({ fonts: [] });
    });

    it("lists fonts from macOS font directories", async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) =>
          p === "/Library/Fonts" || p === "/home/user/Library/Fonts"
      );
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(
        (dir: string) => {
          if (dir === "/Library/Fonts") {
            return ["Arial.ttf", "Helvetica.otf", "Readme.txt"];
          }
          if (dir === "/home/user/Library/Fonts") {
            return ["CustomFont.ttf"];
          }
          return [];
        }
      );

      const caller = createCaller(makeCtx());
      const result = await caller.fonts.list();
      expect(result.fonts).toContain("Arial");
      expect(result.fonts).toContain("Helvetica");
      expect(result.fonts).toContain("CustomFont");
      // Non-font file excluded
      expect(result.fonts.some((f) => f.includes("Readme"))).toBe(false);
      // Sorted
      expect(result.fonts).toEqual([...result.fonts].sort());
    });

    it("deduplicates fonts appearing in multiple directories", async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(
        () => ["Arial.ttf"] // Same font in every directory.
      );

      const caller = createCaller(makeCtx());
      const result = await caller.fonts.list();
      expect(result.fonts.filter((f) => f === "Arial")).toHaveLength(1);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.fonts.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });
});
