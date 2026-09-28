import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasNodetoolCli,
  mcpServersSnippet,
  probeMcpLaunch,
  readMcpClientEntry,
  removeMcpClientEntry,
  stdioLaunch,
  writeMcpClientEntry,
  type McpLaunch
} from "../src/mcp-client-config.js";

const STDIO = stdioLaunch({ npx: false });
const NPX = stdioLaunch({ npx: true });
const HTTP: McpLaunch = { transport: "http", url: "http://127.0.0.1:7777/mcp" };

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mcp-client-config-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function readJsonFile(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("Claude Code", () => {
  it("writes the user scope, which applies to every project", () => {
    const path = writeMcpClientEntry("claude", STDIO, home);
    expect(readJsonFile(path).mcpServers.nodetool).toEqual({
      type: "stdio",
      command: "nodetool",
      args: ["mcp", "serve"],
      env: {}
    });
    expect(readMcpClientEntry("claude", home)).toEqual(STDIO);
  });

  it("moves an entry an earlier installer left in the home project", () => {
    const path = join(home, ".claude.json");
    writeFileSync(
      path,
      JSON.stringify({
        numStartups: 3,
        mcpServers: { other: { type: "http", url: "https://x.test/mcp" } },
        projects: {
          [home]: {
            mcpServers: {
              nodetool: { type: "http", url: "http://127.0.0.1:7777/mcp" },
              fal: { type: "http", url: "https://fal.test/mcp" }
            }
          }
        }
      })
    );

    writeMcpClientEntry("claude", STDIO, home);

    const config = readJsonFile(path);
    expect(config.numStartups).toBe(3);
    expect(config.mcpServers.other).toBeDefined();
    expect(config.mcpServers.nodetool.command).toBe("nodetool");
    expect(config.projects[home].mcpServers.nodetool).toBeUndefined();
    expect(config.projects[home].mcpServers.fal).toBeDefined();
  });

  it("keeps a user's own home-project entry that the installer did not write", () => {
    const path = join(home, ".claude.json");
    const own = { type: "stdio", command: "/src/nodetool/dev.sh", args: [] };
    writeFileSync(
      path,
      JSON.stringify({ projects: { [home]: { mcpServers: { nodetool: own } } } })
    );

    writeMcpClientEntry("claude", HTTP, home);

    expect(readJsonFile(path).projects[home].mcpServers.nodetool).toEqual(own);
  });

  it("removes the entry and reports when there was none", () => {
    writeMcpClientEntry("claude", STDIO, home);
    expect(removeMcpClientEntry("claude", home)).toBe(true);
    expect(readMcpClientEntry("claude", home)).toBeNull();
    expect(removeMcpClientEntry("claude", home)).toBe(false);
  });
});

describe("Codex", () => {
  it("round-trips a stdio entry and replaces it in place", () => {
    const path = join(home, ".codex", "config.toml");
    writeMcpClientEntry("codex", HTTP, home);
    writeFileSync(path, `model = "o4"\n\n${readFileSync(path, "utf8")}`);

    writeMcpClientEntry("codex", NPX, home);

    const content = readFileSync(path, "utf8");
    expect(content.match(/BEGIN NODETOOL MCP/g)).toHaveLength(1);
    expect(content).toContain('model = "o4"');
    expect(content).toContain(
      'args = ["-y","--package=@nodetool-ai/cli","nodetool","mcp","serve"]'
    );
    expect(content).not.toContain("required");
    expect(readMcpClientEntry("codex", home)).toEqual(NPX);
  });

  it("escapes a URL so it cannot add TOML tables", () => {
    const url = 'http://127.0.0.1:7777/mcp"\n[mcp_servers.evil]\ncommand = "x';
    writeMcpClientEntry("codex", { transport: "http", url }, home);
    const content = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    expect(content).not.toMatch(/^\[mcp_servers\.evil\]/m);
    expect(readMcpClientEntry("codex", home)).toEqual({ transport: "http", url });
  });

  it("removes only the NodeTool block", () => {
    const path = join(home, ".codex", "config.toml");
    writeMcpClientEntry("codex", STDIO, home);
    writeFileSync(path, `model = "o4"\n\n${readFileSync(path, "utf8")}`);
    expect(removeMcpClientEntry("codex", home)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe('model = "o4"\n');
  });
});

describe("OpenCode", () => {
  it("stores the command and its arguments as one array", () => {
    const path = writeMcpClientEntry("opencode", STDIO, home);
    expect(readJsonFile(path).mcp.nodetool).toMatchObject({
      type: "local",
      command: ["nodetool", "mcp", "serve"],
      enabled: true
    });
    expect(readMcpClientEntry("opencode", home)).toEqual(STDIO);
    writeMcpClientEntry("opencode", HTTP, home);
    expect(readMcpClientEntry("opencode", home)).toEqual(HTTP);
  });
});

describe("mcpServersSnippet", () => {
  it("prints the block other clients accept", () => {
    expect(JSON.parse(mcpServersSnippet(NPX))).toEqual({
      mcpServers: {
        nodetool: {
          command: "npx",
          args: ["-y", "--package=@nodetool-ai/cli", "nodetool", "mcp", "serve"]
        }
      }
    });
  });
});

describe("probeMcpLaunch", () => {
  it("reports the server's stderr when it exits before the handshake", async () => {
    const launch: McpLaunch = {
      transport: "stdio",
      command: process.execPath,
      args: ["-e", "console.error('no provider key'); process.exit(1)"]
    };
    await expect(probeMcpLaunch(launch, 10_000)).rejects.toThrow(
      /no provider key/
    );
  });
});

describe.skipIf(process.platform === "win32")("hasNodetoolCli", () => {
  function putOnPath(dir: string, script: string): string {
    const bin = join(home, dir);
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "nodetool"), script);
    chmodSync(join(bin, "nodetool"), 0o755);
    return bin;
  }

  it("accepts the Node CLI", () => {
    const bin = putOnPath("node-bin", "#!/usr/bin/env node\nimport './x.js';\n");
    expect(hasNodetoolCli({ PATH: bin })).toBe(true);
  });

  it("rejects the legacy Python wrapper that shadows it on PATH", () => {
    const legacy = putOnPath(
      "legacy-bin",
      '#!/usr/bin/env bash\nexec python -m nodetool.cli "$@"\n'
    );
    const node = putOnPath("node-bin", "#!/usr/bin/env node\n");
    expect(hasNodetoolCli({ PATH: `${legacy}:${node}` })).toBe(false);
  });

  it("is false when nothing named nodetool is on PATH", () => {
    expect(hasNodetoolCli({ PATH: home })).toBe(false);
  });
});
