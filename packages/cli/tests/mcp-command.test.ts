/**
 * Exit codes of `nodetool mcp uninstall` and `nodetool mcp status --check`
 * (src/commands/mcp.ts). `install` already exits 1 when a client config
 * cannot be written; these two printed the failure in a table and exited 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const removeMcpClientEntry = vi.fn();
const readMcpClientEntry = vi.fn();
const probeMcpLaunch = vi.fn();

vi.mock("@nodetool-ai/websocket/mcp-client-config", () => ({
  MCP_CLIENT_IDS: ["claude"],
  MCP_CLIENT_LABELS: { claude: "Claude Code" },
  describeLaunch: () => "nodetool mcp serve",
  isMcpClientPresent: () => true,
  probeMcpLaunch,
  readMcpClientEntry,
  removeMcpClientEntry
}));

const { registerMcpClientCommands } = await import("../src/commands/mcp.js");

async function run(argv: string[]): Promise<number | undefined> {
  const program = new Command();
  program.exitOverride();
  registerMcpClientCommands(program.command("mcp"));
  process.exitCode = undefined;
  await program.parseAsync(["mcp", ...argv], { from: "user" });
  const code = process.exitCode;
  process.exitCode = undefined;
  return code;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  removeMcpClientEntry.mockReset();
  readMcpClientEntry.mockReset();
  probeMcpLaunch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nodetool mcp uninstall", () => {
  it("exits 0 when the entry is removed", async () => {
    removeMcpClientEntry.mockReturnValue(true);
    expect(await run(["uninstall"])).toBeUndefined();
  });

  it("exits 1 when a client config cannot be rewritten", async () => {
    removeMcpClientEntry.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    expect(await run(["uninstall"])).toBe(1);
  });
});

describe("nodetool mcp status --check", () => {
  it("exits 0 when every registered server starts", async () => {
    readMcpClientEntry.mockReturnValue({ transport: "stdio" });
    probeMcpLaunch.mockResolvedValue({ tools: [{}], elapsedMs: 10 });
    expect(await run(["status", "--check"])).toBeUndefined();
  });

  it("exits 1 when a registered server fails to start", async () => {
    readMcpClientEntry.mockReturnValue({ transport: "stdio" });
    probeMcpLaunch.mockRejectedValue(new Error("spawn nodetool ENOENT"));
    expect(await run(["status", "--check"])).toBe(1);
  });
});
