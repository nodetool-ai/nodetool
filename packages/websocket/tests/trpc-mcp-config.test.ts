import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock filesystem + os helpers so we don't touch real user config dirs.
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  };
});
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return {
    ...actual,
    homedir: vi.fn(() => "/home/user")
  };
});

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync
} from "node:fs";
import { homedir } from "node:os";

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

describe("mcpConfig router", () => {
  beforeEach(() => {
    // resetAllMocks also clears `mockImplementation` from previous tests —
    // necessary because some tests install throwing implementations on
    // writeFileSync that would leak into later tests otherwise.
    vi.resetAllMocks();
    // Re-install defaults that the whole suite relies on.
    (homedir as ReturnType<typeof vi.fn>).mockReturnValue("/home/user");
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    delete process.env.NODETOOL_ENV;
    delete process.env.PORT;
    delete process.env.TLS_CERT;
    delete process.env.TLS_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── production gate ─────────────────────────────────────────────
  describe("production mode", () => {
    it("status throws SERVICE_UNAVAILABLE in production", async () => {
      process.env.NODETOOL_ENV = "production";
      const caller = createCaller(makeCtx());
      await expect(caller.mcpConfig.status()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR" // tRPC maps SERVICE_UNAVAILABLE → INTERNAL_SERVER_ERROR
      });
    });

    it("install throws SERVICE_UNAVAILABLE in production", async () => {
      process.env.NODETOOL_ENV = "production";
      const caller = createCaller(makeCtx());
      await expect(
        caller.mcpConfig.install({ targets: ["claude"] })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("uninstall throws SERVICE_UNAVAILABLE in production", async () => {
      process.env.NODETOOL_ENV = "production";
      const caller = createCaller(makeCtx());
      await expect(
        caller.mcpConfig.uninstall({ targets: ["claude"] })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ── status ──────────────────────────────────────────────────────
  describe("status", () => {
    it("returns all targets as not-installed when no config files exist", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      expect(result.targets).toHaveLength(3);
      for (const t of result.targets) {
        expect(t.installed).toBe(false);
        expect(t.url).toBeNull();
      }
      expect(result.defaultUrl).toMatch(/^https?:\/\//);
    });

    it("defaultUrl uses PORT env var", async () => {
      process.env.PORT = "9999";
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      expect(result.defaultUrl).toBe("http://127.0.0.1:9999/mcp");
    });

    it("defaultUrl switches to https when TLS_CERT and TLS_KEY are set", async () => {
      process.env.TLS_CERT = "/etc/cert.pem";
      process.env.TLS_KEY = "/etc/key.pem";
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      expect(result.defaultUrl).toMatch(/^https:\/\//);
    });

    it("reads claude installation when .claude.json has nodetool MCP server", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.claude.json"
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          projects: {
            "/home/user": {
              mcpServers: {
                nodetool: { type: "http", url: "http://127.0.0.1:7777/mcp" }
              }
            }
          }
        })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      const claude = result.targets.find((t) => t.target === "claude");
      expect(claude?.installed).toBe(true);
      expect(claude?.url).toBe("http://127.0.0.1:7777/mcp");
      expect(claude?.configPath).toBe("/home/user/.claude.json");
    });

    it("reads codex installation by regex from config.toml", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.codex/config.toml"
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        `# BEGIN NODETOOL MCP
[mcp_servers.nodetool]
url = "http://127.0.0.1:7777/mcp"
# END NODETOOL MCP
`
      );

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      const codex = result.targets.find((t) => t.target === "codex");
      expect(codex?.installed).toBe(true);
      expect(codex?.url).toBe("http://127.0.0.1:7777/mcp");
    });

    it("reads opencode installation from opencode.json", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.config/opencode/opencode.json"
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          mcp: {
            nodetool: { type: "remote", url: "http://127.0.0.1:7777/mcp" }
          }
        })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      const opencode = result.targets.find((t) => t.target === "opencode");
      expect(opencode?.installed).toBe(true);
      expect(opencode?.url).toBe("http://127.0.0.1:7777/mcp");
    });

    it("tolerates corrupt JSON config files gracefully", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("{garbage");

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.status();
      for (const t of result.targets) {
        expect(t.installed).toBe(false);
      }
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.mcpConfig.status()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── install ─────────────────────────────────────────────────────
  describe("install", () => {
    it("installs all targets when no targets specified", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.install({});
      expect(result.results).toHaveLength(3);
      expect(writeFileSync).toHaveBeenCalledTimes(3);
      expect(result.url).toMatch(/^http/);
    });

    it("installs only requested targets", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.install({ targets: ["claude"] });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.target).toBe("claude");
      expect(result.results[0]?.success).toBe(true);
      expect(result.results[0]?.configPath).toBe("/home/user/.claude.json");
    });

    it("uses provided url when specified", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.install({
        targets: ["claude"],
        url: "http://example.com:9000/mcp"
      });
      expect(result.url).toBe("http://example.com:9000/mcp");
    });

    it("creates parent directories for codex/opencode", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      await caller.mcpConfig.install({ targets: ["codex", "opencode"] });
      expect(mkdirSync).toHaveBeenCalledWith("/home/user/.codex", {
        recursive: true
      });
      expect(mkdirSync).toHaveBeenCalledWith(
        "/home/user/.config/opencode",
        { recursive: true }
      );
    });

    it("captures per-target error without failing the whole request", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => {
          if (p === "/home/user/.claude.json") throw new Error("disk full");
        }
      );

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.install({
        targets: ["claude", "codex"]
      });
      expect(result.results).toHaveLength(2);
      const claude = result.results.find((r) => r.target === "claude");
      expect(claude?.success).toBe(false);
      expect(claude?.error).toContain("disk full");
      const codex = result.results.find((r) => r.target === "codex");
      expect(codex?.success).toBe(true);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.mcpConfig.install({ targets: ["claude"] })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── uninstall ───────────────────────────────────────────────────
  describe("uninstall", () => {
    it("returns removed=false for targets with no config files", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.uninstall({ targets: ["claude"] });
      expect(result.results[0]?.removed).toBe(false);
    });

    it("removes nodetool entry from .claude.json when present", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.claude.json"
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({
          projects: {
            "/home/user": {
              mcpServers: {
                nodetool: { url: "x" },
                other: { url: "y" }
              }
            }
          }
        })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.uninstall({ targets: ["claude"] });
      expect(result.results[0]?.removed).toBe(true);
      // Verify writeFileSync was called with the modified config.
      const writeCalls = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
      expect(writeCalls).toHaveLength(1);
      const writtenContent = writeCalls[0]?.[1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.projects["/home/user"].mcpServers.nodetool).toBeUndefined();
      expect(parsed.projects["/home/user"].mcpServers.other).toBeDefined();
    });

    it("removes block from codex config.toml", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) => p === "/home/user/.codex/config.toml"
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
        `[something_else]
foo = "bar"

# BEGIN NODETOOL MCP
url = "x"
# END NODETOOL MCP
`
      );

      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.uninstall({ targets: ["codex"] });
      expect(result.results[0]?.removed).toBe(true);
      const writtenContent = (writeFileSync as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[1] as string;
      expect(writtenContent).not.toContain("BEGIN NODETOOL MCP");
      expect(writtenContent).toContain("something_else");
    });

    it("uninstalls all targets when none specified", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.mcpConfig.uninstall({});
      expect(result.results).toHaveLength(3);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.mcpConfig.uninstall({ targets: ["claude"] })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
