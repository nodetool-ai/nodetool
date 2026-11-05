import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLaunch } from "../src/commands/mcp.js";

let bin: string;
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "mcp-launch-"));
  vi.stubEnv("PATH", bin);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(bin, { recursive: true, force: true }); });

describe("MCP CLI generated MCP launch", () => {
  it("selects the explicit MCP package when the MCP binary is absent", async () => {
    expect(await resolveLaunch({})).toEqual({ transport: "stdio", command: "npx", args: ["-y", "@nodetool-ai/cli-mcp", "serve"] });
  });

  it("uses the installed MCP binary and preserves forced npx selection", async () => {
    const executable = process.platform === "win32" ? "nodetool-mcp.CMD" : "nodetool-mcp";
    writeFileSync(join(bin, executable), process.platform === "win32" ? "node cli-mcp/dist/nodetool.js" : "#!/usr/bin/env node\n");
    expect(await resolveLaunch({})).toEqual({ transport: "stdio", command: "nodetool-mcp", args: ["serve"] });
    expect(await resolveLaunch({ npx: true })).toEqual({ transport: "stdio", command: "npx", args: ["-y", "@nodetool-ai/cli-mcp", "serve"] });
  });

  it("preserves an explicitly requested HTTP endpoint", async () => {
    expect(await resolveLaunch({ url: "http://127.0.0.1:7777/mcp" })).toEqual({ transport: "http", url: "http://127.0.0.1:7777/mcp" });
  });
});
