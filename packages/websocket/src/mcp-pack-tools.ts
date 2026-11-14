/**
 * Pack management over MCP, for local sessions only.
 *
 * Server and MCP processes refuse pack installs in-process
 * (`refusePackInstallsInProcess`), so every operation runs the `nodetool packs`
 * CLI in a child process. The MCP client's tool approval stands in for the
 * CLI's confirmation prompt, which is why `manage_packs` passes `--yes`.
 */
import { spawn } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findOnPath } from "./mcp-client-config.js";

const PACK_ID = /^[a-z0-9@][a-z0-9._/@-]*$/i;
const RESTART_NOTICE =
  "Restart running NodeTool servers and MCP sessions to load the changed packs.";

export interface PackCliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type PackCliRunner = (args: readonly string[]) => Promise<PackCliResult>;

/** `NODETOOL_CLI` overrides the `nodetool` executable found on PATH. */
export function resolveNodetoolCli(env: NodeJS.ProcessEnv = process.env): string | null {
  return env["NODETOOL_CLI"] || findOnPath("nodetool", env);
}

export const runPackCli: PackCliRunner = (args) => {
  const cli = resolveNodetoolCli();
  if (!cli) {
    return Promise.reject(new Error(
      "The nodetool CLI is not on PATH. Install it with `npm install -g @nodetool-ai/cli` or set NODETOOL_CLI."
    ));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cli, ["packs", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1" },
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
};

function assertIds(ids: readonly string[]): void {
  const bad = ids.find((id) => !PACK_ID.test(id));
  if (bad !== undefined) { throw new Error(`Invalid pack id: ${bad}`); }
}

function response(result: PackCliResult, notice?: string) {
  const text = [result.stdout.trim(), result.stderr.trim(), result.code === 0 ? notice : undefined]
    .filter(Boolean).join("\n\n") || "(no output)";
  return { content: [{ type: "text" as const, text }], isError: result.code !== 0 };
}

function failure(err: unknown) {
  return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

/** Register `inspect_packs` and `manage_packs`. Call only for a local session. */
export function registerPackMcpTools(server: McpServer, run: PackCliRunner = runPackCli): void {
  server.tool(
    "inspect_packs",
    "Inspect NodeTool node packs on this machine. list: available and installed packs and runtime libraries. " +
      "why: which pack owns a node type, or what a pack requires. doctor: check install integrity.",
    {
      action: z.enum(["list", "why", "doctor"]),
      target: z.string().optional().describe("Node type or pack id; required for why.")
    },
    async ({ action, target }) => {
      try {
        if (action === "list") { return response(await run(["list", "--json"])); }
        if (action === "doctor") { return response(await run(["doctor", "--json"])); }
        if (!target) { throw new Error("why requires target."); }
        assertIds([target]);
        return response(await run(["why", target]));
      } catch (err) { return failure(err); }
    }
  );

  server.tool(
    "manage_packs",
    "Install, remove, or repair NodeTool node packs on this machine. Installs npm packages, " +
      "which can run install scripts. Running servers need a restart afterwards.",
    {
      action: z.enum(["add", "remove", "repair"]),
      ids: z.array(z.string()).optional().describe("Pack or runtime library ids; required for add and remove.")
    },
    async ({ action, ids = [] }) => {
      try {
        if (action === "repair") { return response(await run(["doctor", "--repair", "--json"]), RESTART_NOTICE); }
        if (ids.length === 0) { throw new Error(`${action} requires ids.`); }
        assertIds(ids);
        const args = action === "add" ? ["add", ...ids, "--yes"] : ["remove", ...ids];
        return response(await run(args), RESTART_NOTICE);
      } catch (err) { return failure(err); }
    }
  );
}
