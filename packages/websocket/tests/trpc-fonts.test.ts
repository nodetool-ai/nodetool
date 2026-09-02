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
import { join } from "node:path";
import { BUNDLED_FONT_FAMILIES } from "@nodetool-ai/timeline";

// The router builds the user font dir with path.join (backslashes on
// Windows); mock and match it the same way.
const USER_FONTS = join("/home/user", "Library", "Fonts");

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
    // The system scan is mocked; what a bare system still has is the bundled
    // corpus, which ships with the product rather than with the machine (D8).
    const systemNames = (
      fonts: { name: string; source: string }[]
    ): string[] =>
      fonts.filter((f) => f.source === "system").map((f) => f.name);

    it("lists only the bundled corpus on a bare system", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.fonts.list();
      expect(result.fonts.map((f) => f.name)).toEqual([
        ...BUNDLED_FONT_FAMILIES
      ]);
      expect(result.fonts.every((f) => f.source === "bundled")).toBe(true);
      expect(result.fonts.every((f) => f.portable)).toBe(true);
    });

    it("puts the bundled families before the system ones", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
        "Arial.ttf"
      ]);

      const caller = createCaller(makeCtx());
      const { fonts } = await caller.fonts.list();
      const firstSystem = fonts.findIndex((f) => f.source === "system");
      expect(firstSystem).toBe(BUNDLED_FONT_FAMILIES.length);
      expect(fonts[firstSystem]).toEqual({
        name: "Arial",
        source: "system",
        portable: false
      });
    });

    // A machine that also has Inter installed must not offer it twice, and the
    // bundled copy is the one every host actually draws with.
    it("drops a system font a bundled family already covers", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
        "Inter.ttf",
        "Arial.ttf"
      ]);

      const caller = createCaller(makeCtx());
      const { fonts } = await caller.fonts.list();
      expect(fonts.filter((f) => f.name === "Inter")).toHaveLength(1);
      expect(systemNames(fonts)).toEqual(["Arial"]);
    });

    it("lists fonts from macOS font directories", async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) =>
          p === "/Library/Fonts" || p === USER_FONTS
      );
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(
        (dir: string) => {
          if (dir === "/Library/Fonts") {
            return ["Arial.ttf", "Helvetica.otf", "Readme.txt"];
          }
          if (dir === USER_FONTS) {
            return ["CustomFont.ttf"];
          }
          return [];
        }
      );

      const caller = createCaller(makeCtx());
      const result = await caller.fonts.list();
      const system = systemNames(result.fonts);
      expect(system).toContain("Arial");
      expect(system).toContain("Helvetica");
      expect(system).toContain("CustomFont");
      // Non-font file excluded
      expect(system.some((name) => name.includes("Readme"))).toBe(false);
      // Sorted
      expect(system).toEqual([...system].sort());
    });

    it("deduplicates fonts appearing in multiple directories", async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(
        () => ["Arial.ttf"] // Same font in every directory.
      );

      const caller = createCaller(makeCtx());
      const result = await caller.fonts.list();
      expect(result.fonts.filter((f) => f.name === "Arial")).toHaveLength(1);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.fonts.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });
});
