/**
 * Register the NodeTool MCP server in the config files of local agent
 * harnesses: Claude Code, Codex, and OpenCode.
 *
 * Both `nodetool mcp install` and the Settings → MCP buttons write through this
 * module, so the two surfaces produce the same entry in the same place.
 *
 * An entry launches NodeTool one of two ways:
 * - `stdio`: the harness starts `nodetool mcp serve` itself. This needs no
 *   running app. When the app is running, the stdio process forwards to it.
 * - `http`: the harness connects to a running NodeTool server's `/mcp` mount.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { delimiter, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpClientId = "claude" | "codex" | "opencode";

export type McpLaunch =
  | { transport: "stdio"; command: string; args: string[] }
  | { transport: "http"; url: string };

export const MCP_CLIENT_IDS: readonly McpClientId[] = [
  "claude",
  "codex",
  "opencode"
];

export const MCP_CLIENT_LABELS = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode"
} satisfies Record<McpClientId, string>;

/** The name the server has in every client config. */
const SERVER_NAME = "nodetool";

/** The published CLI package. It has two bins, so `npx` needs `--package`. */
const CLI_PACKAGE = "@nodetool-ai/cli";

const CODEX_BEGIN = "# BEGIN NODETOOL MCP";
const CODEX_END = "# END NODETOOL MCP";
const CODEX_BLOCK = /# BEGIN NODETOOL MCP[\s\S]*?# END NODETOOL MCP\n?/;

/**
 * Codex and OpenCode give a stdio server a short start window by default. The
 * first `npx` launch downloads the CLI, and a video generation can run for
 * minutes, so both limits are raised.
 */
const STARTUP_TIMEOUT_SEC = 120;
const TOOL_TIMEOUT_SEC = 900;

/** The stdio launch for `nodetool mcp serve`. */
export function stdioLaunch(options: { npx: boolean }): McpLaunch {
  if (options.npx) {
    return {
      transport: "stdio",
      command: "npx",
      args: ["-y", `--package=${CLI_PACKAGE}`, "nodetool", "mcp", "serve"]
    };
  }
  return { transport: "stdio", command: "nodetool", args: ["mcp", "serve"] };
}

/** The first executable with this name on `PATH`, or null. */
function findOnPath(name: string, env: NodeJS.ProcessEnv): string | null {
  const dirs = (env["PATH"] ?? "").split(delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";")
      : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** True when an executable with this name is on `PATH`. */
export function isOnPath(name: string, env = process.env): boolean {
  return findOnPath(name, env) !== null;
}

/**
 * True when the `nodetool` a client would run is this TypeScript CLI. The
 * legacy Python installer puts a bash `nodetool` on `PATH` that has no
 * `mcp serve`, so a match by name alone is not enough.
 */
export function hasNodetoolCli(env = process.env): boolean {
  const found = findOnPath("nodetool", env);
  if (!found) return false;
  try {
    const head = readFileSync(realpathSync(found), "utf8").slice(0, 512);
    return process.platform === "win32"
      ? head.includes("nodetool.js")
      : /^#!.*\bnode\b/.test(head);
  } catch {
    return false;
  }
}

/** One line a person can read: the command, or the URL. */
export function describeLaunch(launch: McpLaunch): string {
  return launch.transport === "stdio"
    ? [launch.command, ...launch.args].join(" ")
    : launch.url;
}

/** The `mcpServers` JSON block most MCP clients accept. */
export function mcpServersSnippet(launch: McpLaunch): string {
  const server =
    launch.transport === "stdio"
      ? { command: launch.command, args: launch.args }
      : { type: "http", url: launch.url };
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: server } }, null, 2);
}

export function mcpClientConfigPath(client: McpClientId, home: string): string {
  switch (client) {
    case "claude":
      return join(home, ".claude.json");
    case "codex":
      return join(home, ".codex", "config.toml");
    case "opencode":
      return join(home, ".config", "opencode", "opencode.json");
  }
}

/** True when the client looks installed: its config dir or its binary. */
export function isMcpClientPresent(client: McpClientId, home: string): boolean {
  switch (client) {
    case "claude":
      return (
        existsSync(join(home, ".claude.json")) ||
        existsSync(join(home, ".claude")) ||
        isOnPath("claude")
      );
    case "codex":
      return existsSync(join(home, ".codex")) || isOnPath("codex");
    case "opencode":
      return (
        existsSync(join(home, ".config", "opencode")) || isOnPath("opencode")
      );
  }
}

type JsonObject = Record<string, unknown>;

function readJson(path: string): JsonObject {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function writeJson(path: string, value: JsonObject): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Earlier installers wrote the Claude Code entry under `projects[<home>]`. That
 * is the local scope of the home directory, so the server appeared only in
 * sessions started in `~`. Remove that entry when it is the loopback HTTP
 * shape those installers wrote. Anything else there belongs to the user.
 */
function removeLegacyClaudeEntry(config: JsonObject, home: string): boolean {
  const project = asObject(asObject(config["projects"])[home]);
  const servers = asObject(project["mcpServers"]);
  const entry = asObject(servers[SERVER_NAME]);
  const url = typeof entry["url"] === "string" ? entry["url"] : "";
  if (entry["type"] !== "http" || !/^https?:\/\/127\.0\.0\.1:\d+\/mcp$/.test(url)) {
    return false;
  }
  delete servers[SERVER_NAME];
  return true;
}

function claudeEntry(launch: McpLaunch): JsonObject {
  return launch.transport === "stdio"
    ? { type: "stdio", command: launch.command, args: launch.args, env: {} }
    : { type: "http", url: launch.url };
}

function opencodeEntry(launch: McpLaunch): JsonObject {
  const timeout = STARTUP_TIMEOUT_SEC * 1000;
  return launch.transport === "stdio"
    ? {
        type: "local",
        command: [launch.command, ...launch.args],
        enabled: true,
        timeout
      }
    : { type: "remote", url: launch.url, enabled: true, timeout };
}

/** TOML basic strings accept JSON string escaping, so quotes cannot break out. */
function codexBlock(launch: McpLaunch): string {
  const location =
    launch.transport === "stdio"
      ? [
          `command = ${JSON.stringify(launch.command)}`,
          `args = ${JSON.stringify(launch.args)}`
        ]
      : [`url = ${JSON.stringify(launch.url)}`];
  return [
    CODEX_BEGIN,
    `[mcp_servers.${SERVER_NAME}]`,
    ...location,
    `startup_timeout_sec = ${STARTUP_TIMEOUT_SEC}`,
    `tool_timeout_sec = ${TOOL_TIMEOUT_SEC}`,
    CODEX_END
  ].join("\n");
}

function launchFromEntry(entry: JsonObject): McpLaunch | null {
  if (typeof entry["url"] === "string") {
    return { transport: "http", url: entry["url"] };
  }
  const command = entry["command"];
  if (typeof command === "string") {
    return { transport: "stdio", command, args: stringArray(entry["args"]) };
  }
  // OpenCode stores the command and its arguments as one array.
  const [head, ...rest] = stringArray(command);
  return head ? { transport: "stdio", command: head, args: rest } : null;
}

function parseCodexLaunch(block: string): McpLaunch | null {
  const url = /^url\s*=\s*(".*")\s*$/m.exec(block)?.[1];
  if (url) return { transport: "http", url: JSON.parse(url) as string };
  const command = /^command\s*=\s*(".*")\s*$/m.exec(block)?.[1];
  if (!command) return null;
  const args = /^args\s*=\s*(\[.*\])\s*$/m.exec(block)?.[1];
  return {
    transport: "stdio",
    command: JSON.parse(command) as string,
    args: args ? stringArray(JSON.parse(args)) : []
  };
}

/** The NodeTool entry the client has now, or null. Throws on unreadable config. */
export function readMcpClientEntry(
  client: McpClientId,
  home: string
): McpLaunch | null {
  const path = mcpClientConfigPath(client, home);
  if (!existsSync(path)) return null;
  switch (client) {
    case "claude": {
      const servers = asObject(readJson(path)["mcpServers"]);
      return launchFromEntry(asObject(servers[SERVER_NAME]));
    }
    case "codex": {
      const block = CODEX_BLOCK.exec(readFileSync(path, "utf8"))?.[0];
      return block ? parseCodexLaunch(block) : null;
    }
    case "opencode": {
      const servers = asObject(readJson(path)["mcp"]);
      return launchFromEntry(asObject(servers[SERVER_NAME]));
    }
  }
}

/** Write the NodeTool entry. Returns the config file path. */
export function writeMcpClientEntry(
  client: McpClientId,
  launch: McpLaunch,
  home: string
): string {
  const path = mcpClientConfigPath(client, home);
  switch (client) {
    case "claude": {
      // Top-level `mcpServers` is Claude Code's user scope: every project.
      const config = readJson(path);
      removeLegacyClaudeEntry(config, home);
      const servers = asObject(config["mcpServers"]);
      servers[SERVER_NAME] = claudeEntry(launch);
      config["mcpServers"] = servers;
      writeJson(path, config);
      return path;
    }
    case "codex": {
      mkdirSync(join(home, ".codex"), { recursive: true });
      const block = codexBlock(launch);
      const content = existsSync(path) ? readFileSync(path, "utf8") : "";
      const next = CODEX_BLOCK.test(content)
        ? content.replace(CODEX_BLOCK, block + "\n")
        : (content.trim() ? content.trimEnd() + "\n\n" : "") + block + "\n";
      writeFileSync(path, next);
      return path;
    }
    case "opencode": {
      mkdirSync(join(home, ".config", "opencode"), { recursive: true });
      const config = readJson(path);
      const servers = asObject(config["mcp"]);
      servers[SERVER_NAME] = opencodeEntry(launch);
      config["mcp"] = servers;
      writeJson(path, config);
      return path;
    }
  }
}

/** Remove the NodeTool entry. Returns false when there was none. */
export function removeMcpClientEntry(client: McpClientId, home: string): boolean {
  const path = mcpClientConfigPath(client, home);
  if (!existsSync(path)) return false;
  switch (client) {
    case "claude": {
      const config = readJson(path);
      const servers = asObject(config["mcpServers"]);
      const hadEntry = SERVER_NAME in servers;
      delete servers[SERVER_NAME];
      const hadLegacy = removeLegacyClaudeEntry(config, home);
      if (!hadEntry && !hadLegacy) return false;
      writeJson(path, config);
      return true;
    }
    case "codex": {
      const content = readFileSync(path, "utf8");
      if (!CODEX_BLOCK.test(content)) return false;
      writeFileSync(path, content.replace(CODEX_BLOCK, "").trimEnd() + "\n");
      return true;
    }
    case "opencode": {
      const config = readJson(path);
      const servers = asObject(config["mcp"]);
      if (!(SERVER_NAME in servers)) return false;
      delete servers[SERVER_NAME];
      writeJson(path, config);
      return true;
    }
  }
}

export interface McpProbeResult {
  serverName: string;
  tools: string[];
  elapsedMs: number;
}

/**
 * Start the server the way a harness would, complete the MCP handshake, and
 * list its tools. A stdio probe also warms the `npx` cache, so the harness's
 * own first start stays inside its startup timeout.
 */
export async function probeMcpLaunch(
  launch: McpLaunch,
  timeoutMs = STARTUP_TIMEOUT_SEC * 1000
): Promise<McpProbeResult> {
  const started = Date.now();
  let stderr = "";
  let transport: Transport;
  if (launch.transport === "stdio") {
    const stdio = new StdioClientTransport({
      command: launch.command,
      args: launch.args,
      stderr: "pipe"
    });
    stdio.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    transport = stdio;
  } else {
    transport = new StreamableHTTPClientTransport(new URL(launch.url));
  }
  const client = new Client({ name: "nodetool-mcp-probe", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: timeoutMs });
    const { tools } = await client.listTools(undefined, { timeout: timeoutMs });
    return {
      serverName: client.getServerVersion()?.name ?? "",
      tools: tools.map((tool) => tool.name),
      elapsedMs: Date.now() - started
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const tail = stderr.trim().split("\n").slice(-5).join("\n");
    throw new Error(tail ? `${reason}\n${tail}` : reason);
  } finally {
    await client.close();
  }
}
