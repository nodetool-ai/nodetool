/**
 * MCP Config router — migrated from REST `/api/mcp/*`.
 *
 * Manages NodeTool MCP server installation in AI coding assistants
 * (Claude Code, Codex, OpenCode). The procedures mutate user config files
 * on the local filesystem, so they are disabled in production via
 * `NODETOOL_ENV=production` → SERVICE_UNAVAILABLE.
 *
 * The router is always registered on `appRouter` so the type surface stays
 * consistent for clients; the production guard is applied inside each
 * procedure.
 */

import { homedir } from "node:os";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { getLocalMcpServerUrl } from "../../mcp-server.js";
import {
  MCP_CLIENT_IDS,
  MCP_CLIENT_LABELS,
  describeLaunch,
  hasNodetoolCli,
  mcpClientConfigPath,
  readMcpClientEntry,
  removeMcpClientEntry,
  stdioLaunch,
  writeMcpClientEntry,
  type McpLaunch
} from "../../mcp-client-config.js";
import {
  statusOutput,
  installInput,
  installOutput,
  uninstallInput,
  uninstallOutput,
  type McpTarget,
  type TargetStatus,
  type InstallResult,
  type UninstallResult
} from "@nodetool-ai/protocol/api-schemas/mcp-config.js";

/** Guard: MCP config is disabled in production. */
function requireNonProduction(): void {
  if (process.env["NODETOOL_ENV"] === "production") {
    throwApiError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      "MCP configuration is not available in production"
    );
  }
}

/**
 * A stdio entry works whether or not this server runs, so it wins when the
 * `nodetool` CLI is installed. Without the CLI, the client reaches this
 * server over HTTP, which works while the server runs.
 */
function defaultLaunch(url: string | undefined): McpLaunch {
  if (url) return { transport: "http", url };
  if (hasNodetoolCli()) return stdioLaunch({ npx: false });
  return { transport: "http", url: getLocalMcpServerUrl() };
}

function getStatus(target: McpTarget): TargetStatus {
  const home = homedir();
  const base: TargetStatus = {
    target,
    label: MCP_CLIENT_LABELS[target],
    installed: false,
    url: null,
    command: null,
    configPath: mcpClientConfigPath(target, home)
  };
  let launch: McpLaunch | null = null;
  try {
    launch = readMcpClientEntry(target, home);
  } catch {
    // An unreadable config reads as "not installed". Install reports the error.
  }
  if (!launch) return base;
  return {
    ...base,
    installed: true,
    url: launch.transport === "http" ? launch.url : null,
    command: launch.transport === "stdio" ? describeLaunch(launch) : null
  };
}

/** Empty or missing `targets` means every client. */
function resolveTargets(raw: readonly McpTarget[] | undefined): McpTarget[] {
  return raw && raw.length > 0 ? [...raw] : [...MCP_CLIENT_IDS];
}

export const mcpConfigRouter = router({
  status: protectedProcedure.output(statusOutput).query(() => {
    requireNonProduction();
    const launch = defaultLaunch(undefined);
    return {
      targets: MCP_CLIENT_IDS.map(getStatus),
      defaultUrl: getLocalMcpServerUrl(),
      defaultLaunch: describeLaunch(launch)
    };
  }),

  install: protectedProcedure
    .input(installInput)
    .output(installOutput)
    .mutation(({ input }) => {
      requireNonProduction();
      const targets = resolveTargets(input.targets);
      const launch = defaultLaunch(input.url);

      const results: InstallResult[] = targets.map((t) => {
        try {
          const configPath = writeMcpClientEntry(t, launch, homedir());
          return {
            target: t,
            label: MCP_CLIENT_LABELS[t],
            success: true,
            configPath
          };
        } catch (e) {
          return {
            target: t,
            label: MCP_CLIENT_LABELS[t],
            success: false,
            error: String(e)
          };
        }
      });
      return { results, launch: describeLaunch(launch) };
    }),

  uninstall: protectedProcedure
    .input(uninstallInput)
    .output(uninstallOutput)
    .mutation(({ input }) => {
      requireNonProduction();
      const targets = resolveTargets(input.targets);

      const results: UninstallResult[] = targets.map((t) => {
        try {
          const removed = removeMcpClientEntry(t, homedir());
          return { target: t, label: MCP_CLIENT_LABELS[t], removed };
        } catch (e) {
          return {
            target: t,
            label: MCP_CLIENT_LABELS[t],
            removed: false,
            error: String(e)
          };
        }
      });
      return { results };
    })
});
