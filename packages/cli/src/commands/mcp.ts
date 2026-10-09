/**
 * `nodetool mcp install | uninstall | status | config` — register NodeTool as
 * an MCP server in local agent harnesses. `nodetool mcp serve` stays in
 * nodetool.ts, beside the node registry setup it needs.
 */
import type { Command } from "commander";
import { homedir } from "node:os";
import type {
  McpClientId,
  McpLaunch
} from "@nodetool-ai/websocket/mcp-client-config";
import { printTable } from "./output.js";

const DEFAULT_HTTP_URL = "http://127.0.0.1:7777/mcp";

interface LaunchOptions {
  http?: boolean;
  url?: string;
  npx?: boolean;
}

interface TargetOptions {
  claude?: boolean;
  codex?: boolean;
  opencode?: boolean;
}

type InstallOptions = LaunchOptions & TargetOptions & { verify: boolean };

const loadConfig = () => import("@nodetool-ai/websocket/mcp-client-config");

/**
 * `--http` or `--url` selects the HTTP transport. Otherwise the client starts
 * `nodetool mcp serve` itself: through the installed CLI when it is on PATH,
 * or through `npx` when it is not.
 */
export async function resolveLaunch(opts: LaunchOptions): Promise<McpLaunch> {
  if (opts.http || opts.url) {
    return { transport: "http", url: opts.url ?? DEFAULT_HTTP_URL };
  }
  const { hasNodetoolCli, stdioLaunch } = await loadConfig();
  return stdioLaunch({ npx: opts.npx === true || !hasNodetoolCli() });
}

function selectedTargets(opts: TargetOptions): McpClientId[] {
  return (["claude", "codex", "opencode"] as const).filter((id) => opts[id]);
}

function addTargetOptions(command: Command, verb: string): Command {
  return command
    .option("--claude", `${verb} Claude Code`)
    .option("--codex", `${verb} Codex`)
    .option("--opencode", `${verb} OpenCode`);
}

function addLaunchOptions(command: Command): Command {
  return command
    .option(
      "--npx",
      "Launch through npx even when the nodetool CLI is on PATH"
    )
    .option(
      "--http",
      `Connect to a running NodeTool server over HTTP (${DEFAULT_HTTP_URL})`
    )
    .option("--url <url>", "Connect over HTTP to this MCP URL");
}

function printNextSteps(labels: string[], launch: McpLaunch): void {
  console.log("\nNext:");
  console.log(`  1. Restart ${labels.join(", ")} to load the server.`);
  console.log('  2. Ask the agent: "Use NodeTool to list my workflows."');
  console.log(
    "  3. Store provider keys once: nodetool secrets store OPENAI_API_KEY"
  );
  if (launch.transport === "http") {
    console.log(
      "\nAn HTTP entry works only while NodeTool runs (Studio or nodetool serve)."
    );
  }
  console.log();
}

export function registerMcpClientCommands(mcp: Command): void {
  addLaunchOptions(
    addTargetOptions(
      mcp
        .command("install")
        .description(
          "Register NodeTool with Claude Code, Codex, and OpenCode. " +
            "Without a target flag, installs for every client found on this machine."
        ),
      "Install for"
    )
  )
    .option("--no-verify", "Write the config without starting the server first")
    .action(async (opts: InstallOptions) => {
      const {
        MCP_CLIENT_IDS,
        MCP_CLIENT_LABELS,
        describeLaunch,
        isMcpClientPresent,
        probeMcpLaunch,
        writeMcpClientEntry
      } = await loadConfig();
      const home = homedir();
      const launch = await resolveLaunch(opts);

      let targets = selectedTargets(opts);
      if (targets.length === 0) {
        targets = MCP_CLIENT_IDS.filter((id) => isMcpClientPresent(id, home));
      }
      if (targets.length === 0) {
        console.error(
          "No Claude Code, Codex, or OpenCode installation found.\n" +
            "Pick one with --claude, --codex, or --opencode, or print a config " +
            "for another client with: nodetool mcp config"
        );
        process.exitCode = 1;
        return;
      }

      console.log(`\nNodeTool MCP server: ${describeLaunch(launch)}`);
      if (opts.verify) {
        console.log("Starting the server to check it…");
        try {
          const probe = await probeMcpLaunch(launch);
          console.log(
            `Verified: ${probe.tools.length} tools in ${(probe.elapsedMs / 1000).toFixed(1)}s`
          );
        } catch (error) {
          console.error(
            `\nThe server did not start: ${error instanceof Error ? error.message : String(error)}\n` +
              (launch.transport === "http"
                ? "Start NodeTool (Studio or nodetool serve), or install the stdio server without --http."
                : "Fix the error above, or skip this check with --no-verify.")
          );
          process.exitCode = 1;
          return;
        }
      }

      const results = targets.map((id) => {
        try {
          const path = writeMcpClientEntry(id, launch, home);
          return { target: MCP_CLIENT_LABELS[id], status: `Installed → ${path}` };
        } catch (error) {
          process.exitCode = 1;
          return { target: MCP_CLIENT_LABELS[id], status: `Error: ${String(error)}` };
        }
      });
      console.log();
      printTable(results);
      printNextSteps(
        targets.map((id) => MCP_CLIENT_LABELS[id]),
        launch
      );
    });

  addTargetOptions(
    mcp
      .command("uninstall")
      .description("Remove the NodeTool MCP server from agent harness configs"),
    "Uninstall from"
  ).action(async (opts: TargetOptions) => {
    const { MCP_CLIENT_IDS, MCP_CLIENT_LABELS, removeMcpClientEntry } =
      await loadConfig();
    const home = homedir();
    const selected = selectedTargets(opts);
    const targets = selected.length > 0 ? selected : [...MCP_CLIENT_IDS];
    const results = targets.map((id) => {
      try {
        const removed = removeMcpClientEntry(id, home);
        return {
          target: MCP_CLIENT_LABELS[id],
          status: removed ? "Removed" : "Not installed"
        };
      } catch (error) {
        process.exitCode = 1;
        return { target: MCP_CLIENT_LABELS[id], status: `Error: ${String(error)}` };
      }
    });
    console.log();
    printTable(results);
    console.log();
  });

  mcp
    .command("status")
    .description("Show where NodeTool is registered as an MCP server")
    .option("--check", "Start each registered server and list its tools")
    .action(async (opts: { check?: boolean }) => {
      const {
        MCP_CLIENT_IDS,
        MCP_CLIENT_LABELS,
        describeLaunch,
        isMcpClientPresent,
        probeMcpLaunch,
        readMcpClientEntry
      } = await loadConfig();
      const home = homedir();
      const rows: { target: string; status: string; launch: string }[] = [];
      for (const id of MCP_CLIENT_IDS) {
        let launch: McpLaunch | null = null;
        let status: string;
        try {
          launch = readMcpClientEntry(id, home);
          status = launch
            ? "Installed"
            : isMcpClientPresent(id, home)
              ? "Not installed"
              : "Client not found";
        } catch {
          status = "Unreadable config";
        }
        if (launch && opts.check) {
          try {
            const probe = await probeMcpLaunch(launch);
            status = `OK: ${probe.tools.length} tools`;
          } catch (error) {
            process.exitCode = 1;
            status = `Failed: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`;
          }
        }
        rows.push({
          target: MCP_CLIENT_LABELS[id],
          status,
          launch: launch ? describeLaunch(launch) : ""
        });
      }
      console.log("\nNodeTool MCP status\n");
      printTable(rows);
      console.log();
    });

  addLaunchOptions(
    mcp
      .command("config")
      .description(
        "Print an mcpServers JSON block for any MCP client (Cursor, Claude Desktop, Windsurf, …)"
      )
  ).action(async (opts: LaunchOptions) => {
    const { mcpServersSnippet } = await loadConfig();
    console.log(mcpServersSnippet(await resolveLaunch(opts)));
  });
}
