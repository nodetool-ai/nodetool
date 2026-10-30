import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLaunch } from "../src/commands/mcp.js";

let bin: string;
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "mcp-full-launch-"));
  vi.stubEnv("PATH", bin);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(bin, { recursive: true, force: true }); });

describe("full CLI generated MCP launch", () => {
  it("selects the explicit full package when the full binary is absent", async () => {
    expect(await resolveLaunch({})).toEqual({ transport: "stdio", command: "npx", args: ["-y", "--package=@nodetool-ai/cli-full", "nodetool-full", "mcp", "serve"] });
  });

  it("uses the installed full binary and preserves forced npx selection", async () => {
    const executable = process.platform === "win32" ? "nodetool-full.CMD" : "nodetool-full";
    writeFileSync(join(bin, executable), process.platform === "win32" ? "node cli-full/dist/nodetool.js" : "#!/usr/bin/env node\n");
    expect(await resolveLaunch({})).toEqual({ transport: "stdio", command: "nodetool-full", args: ["mcp", "serve"] });
    expect(await resolveLaunch({ npx: true })).toEqual({ transport: "stdio", command: "npx", args: ["-y", "--package=@nodetool-ai/cli-full", "nodetool-full", "mcp", "serve"] });
  });

  it("preserves an explicitly requested HTTP endpoint", async () => {
    expect(await resolveLaunch({ url: "http://127.0.0.1:7777/mcp" })).toEqual({ transport: "http", url: "http://127.0.0.1:7777/mcp" });
  });
});
