import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SkillInfo } from "@nodetool-ai/protocol/api-schemas/skills.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock node:fs for filesystem-driven listing procedures.
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn()
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

import { existsSync, readdirSync, readFileSync } from "node:fs";
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

describe("skills router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no skill dirs exist, no entries.
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
    // Reset env var between tests.
    delete process.env.NODETOOL_AGENT_SKILL_DIRS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("returns empty list when no skill directories exist", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.skills.list();
      expect(result).toEqual({ count: 0, skills: [] });
    });

    it("reads skills from ~/.claude/skills with frontmatter", async () => {
      // Only the home directory exists — others return false.
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.claude/skills"
      );
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(
        (dir: string) =>
          dir === "/home/user/.claude/skills"
            ? ["refactor.md", "debug.md", "ignore.txt"]
            : []
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => {
          if (p.endsWith("refactor.md")) {
            return "---\nname: refactor\ndescription: Rewrite code for clarity\n---\nDo the thing.";
          }
          if (p.endsWith("debug.md")) {
            return "# Debug\n\nFind and fix bugs in the codebase.";
          }
          return "";
        }
      );

      const caller = createCaller(makeCtx());
      const result = await caller.skills.list();
      expect(result.count).toBe(2);
      const skills = result.skills as SkillInfo[];
      const refactor = skills.find((s) => s.name === "refactor");
      expect(refactor).toMatchObject({
        name: "refactor",
        description: "Rewrite code for clarity"
      });
      expect(refactor?.path).toBe("/home/user/.claude/skills/refactor.md");
      expect(refactor?.instructions).toBe("Do the thing.");

      const debugSkill = skills.find((s) => s.name === "debug");
      expect(debugSkill?.description).toBe(
        "Find and fix bugs in the codebase."
      );
      expect(debugSkill?.instructions).toMatch(/# Debug/);
    });

    it("filters out entries with invalid names", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => [
        "valid-name.md",
        "Invalid-Has-Uppercase.md",
        "contains-claude.md", // forbidden keyword
        "contains-anthropic.md" // forbidden keyword
      ]);
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        "Description line."
      );

      const caller = createCaller(makeCtx());
      const result = await caller.skills.list();
      const names = result.skills.map((s) => s.name);
      expect(names).toContain("valid-name");
      expect(names.some((n) => n.includes("Invalid"))).toBe(false);
      expect(names.some((n) => n.includes("claude"))).toBe(false);
      expect(names.some((n) => n.includes("anthropic"))).toBe(false);
    });

    it("honors NODETOOL_AGENT_SKILL_DIRS env var", async () => {
      process.env.NODETOOL_AGENT_SKILL_DIRS = "/custom/skills";
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/custom/skills"
      );
      (readdirSync as ReturnType<typeof vi.fn>).mockImplementation(
        (dir: string) =>
          dir === "/custom/skills" ? ["mine.md"] : []
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("My skill.");

      const caller = createCaller(makeCtx());
      const result = await caller.skills.list();
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("mine");
      expect(result.skills[0]?.path).toBe("/custom/skills/mine.md");
    });

    it("deduplicates skill directories", async () => {
      // Env var points to the same dir as one of the defaults.
      process.env.NODETOOL_AGENT_SKILL_DIRS = "/home/user/.claude/skills";
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.claude/skills"
      );
      const readdirMock = readdirSync as ReturnType<typeof vi.fn>;
      readdirMock.mockImplementation((dir: string) =>
        dir === "/home/user/.claude/skills" ? ["once.md"] : []
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("Once.");

      const caller = createCaller(makeCtx());
      const result = await caller.skills.list();
      expect(result.skills).toHaveLength(1);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.skills.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });
});

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
