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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  mcpTarget,
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

const ALL_TARGETS: McpTarget[] = ["claude", "codex", "opencode"];
const TARGET_LABELS: Record<McpTarget, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode"
};

const NODETOOL_MCP_BEGIN = "# BEGIN NODETOOL MCP";
const NODETOOL_MCP_END = "# END NODETOOL MCP";

// ── Helpers ──────────────────────────────────────────────────────

/** Guard: MCP config is disabled in production. */
function requireNonProduction(): void {
  if (process.env["NODETOOL_ENV"] === "production") {
    throwApiError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      "MCP configuration is not available in production"
    );
  }
}

function defaultMcpUrl(): string {
  const port = Number(process.env["PORT"] ?? 7777);
  const tlsEnabled = Boolean(
    process.env["TLS_CERT"] && process.env["TLS_KEY"]
  );
  return `${tlsEnabled ? "https" : "http"}://127.0.0.1:${port}/mcp`;
}

function getStatus(target: McpTarget): TargetStatus {
  const home = homedir();
  const base: TargetStatus = {
    target,
    label: TARGET_LABELS[target],
    installed: false,
    url: null,
    configPath: null
  };

  switch (target) {
    case "claude": {
      const p = join(home, ".claude.json");
      base.configPath = p;
      if (existsSync(p)) {
        try {
          const config = JSON.parse(readFileSync(p, "utf8"));
          const srv = config?.projects?.[home]?.mcpServers?.nodetool;
          if (srv) {
            base.installed = true;
            base.url = srv.url ?? null;
          }
        } catch {
          /* ignore parse errors */
        }
      }
      break;
    }
    case "codex": {
      const p = join(home, ".codex", "config.toml");
      base.configPath = p;
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, "utf8");
          const m = /# BEGIN NODETOOL MCP[\s\S]*?url\s*=\s*"([^"]*)"/.exec(
            content
          );
          if (m) {
            base.installed = true;
            base.url = m[1] ?? null;
          }
        } catch {
          /* ignore */
        }
      }
      break;
    }
    case "opencode": {
      const p = join(home, ".config", "opencode", "opencode.json");
      base.configPath = p;
      if (existsSync(p)) {
        try {
          const config = JSON.parse(readFileSync(p, "utf8"));
          if (config?.mcp?.nodetool) {
            base.installed = true;
            base.url = config.mcp.nodetool.url ?? null;
          }
        } catch {
          /* ignore */
        }
      }
      break;
    }
  }
  return base;
}

function installTarget(target: McpTarget, mcpUrl: string): string {
  const home = homedir();

  switch (target) {
    case "claude": {
      const p = join(home, ".claude.json");
      let config: Record<string, unknown> = {};
      if (existsSync(p)) {
        config = JSON.parse(readFileSync(p, "utf8"));
      }
      const projects = (config["projects"] ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const global = projects[home] ?? {};
      const servers = (global["mcpServers"] ?? {}) as Record<string, unknown>;
      servers["nodetool"] = { type: "http", url: mcpUrl };
      global["mcpServers"] = servers;
      projects[home] = global;
      config["projects"] = projects;
      writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
      return p;
    }
    case "codex": {
      const dir = join(home, ".codex");
      const p = join(dir, "config.toml");
      mkdirSync(dir, { recursive: true });

      const block = [
        NODETOOL_MCP_BEGIN,
        "[mcp_servers.nodetool]",
        `url = "${mcpUrl}"`,
        "startup_timeout_sec = 20",
        "tool_timeout_sec = 60",
        "enabled = true",
        "required = true",
        NODETOOL_MCP_END
      ].join("\n");

      let content = "";
      if (existsSync(p)) {
        content = readFileSync(p, "utf8");
        const re = new RegExp(
          `${NODETOOL_MCP_BEGIN}[\\s\\S]*?${NODETOOL_MCP_END}\\n?`
        );
        content = re.test(content)
          ? content.replace(re, block + "\n")
          : content.trimEnd() + "\n\n" + block + "\n";
      } else {
        content = block + "\n";
      }
      writeFileSync(p, content);
      return p;
    }
    case "opencode": {
      const dir = join(home, ".config", "opencode");
      const p = join(dir, "opencode.json");
      mkdirSync(dir, { recursive: true });

      let config: Record<string, unknown> = {};
      if (existsSync(p)) {
        config = JSON.parse(readFileSync(p, "utf8"));
      }
      const mcp = (config["mcp"] ?? {}) as Record<string, unknown>;
      mcp["nodetool"] = { type: "remote", url: mcpUrl };
      config["mcp"] = mcp;
      writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
      return p;
    }
  }
}

function uninstallTarget(target: McpTarget): boolean {
  const home = homedir();

  switch (target) {
    case "claude": {
      const p = join(home, ".claude.json");
      if (!existsSync(p)) return false;
      try {
        const config = JSON.parse(readFileSync(p, "utf8"));
        const servers = config?.projects?.[home]?.mcpServers;
        if (!servers || !("nodetool" in servers)) return false;
        delete servers["nodetool"];
        writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
        return true;
      } catch {
        return false;
      }
    }
    case "codex": {
      const p = join(home, ".codex", "config.toml");
      if (!existsSync(p)) return false;
      try {
        let content = readFileSync(p, "utf8");
        const re = /# BEGIN NODETOOL MCP[\s\S]*?# END NODETOOL MCP\n?/;
        if (!re.test(content)) return false;
        content = content.replace(re, "").trimEnd() + "\n";
        writeFileSync(p, content);
        return true;
      } catch {
        return false;
      }
    }
    case "opencode": {
      const p = join(home, ".config", "opencode", "opencode.json");
      if (!existsSync(p)) return false;
      try {
        const config = JSON.parse(readFileSync(p, "utf8"));
        if (!config?.mcp?.nodetool) return false;
        delete config.mcp.nodetool;
        writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
        return true;
      } catch {
        return false;
      }
    }
  }
}

/** Filter an unknown input.targets array down to the valid McpTarget enum. */
function resolveTargets(
  raw: readonly McpTarget[] | undefined
): McpTarget[] {
  if (!raw || raw.length === 0) return ALL_TARGETS;
  // Zod already validated against the enum, but keep the guard for clarity.
  return raw.filter((t) => mcpTarget.safeParse(t).success);
}

// ── Router ────────────────────────────────────────────────────────

export const mcpConfigRouter = router({
  status: protectedProcedure.output(statusOutput).query(() => {
    requireNonProduction();
    const statuses = ALL_TARGETS.map(getStatus);
    return { targets: statuses, defaultUrl: defaultMcpUrl() };
  }),

  install: protectedProcedure
    .input(installInput)
    .output(installOutput)
    .mutation(({ input }) => {
      requireNonProduction();
      const targets = resolveTargets(input.targets);
      const mcpUrl = input.url ?? defaultMcpUrl();

      const results: InstallResult[] = targets.map((t) => {
        try {
          const configPath = installTarget(t, mcpUrl);
          return {
            target: t,
            label: TARGET_LABELS[t],
            success: true,
            configPath
          };
        } catch (e) {
          return {
            target: t,
            label: TARGET_LABELS[t],
            success: false,
            error: String(e)
          };
        }
      });
      return { results, url: mcpUrl };
    }),

  uninstall: protectedProcedure
    .input(uninstallInput)
    .output(uninstallOutput)
    .mutation(({ input }) => {
      requireNonProduction();
      const targets = resolveTargets(input.targets);

      const results: UninstallResult[] = targets.map((t) => {
        try {
          const removed = uninstallTarget(t);
          return { target: t, label: TARGET_LABELS[t], removed };
        } catch (e) {
          return {
            target: t,
            label: TARGET_LABELS[t],
            removed: false,
            error: String(e)
          };
        }
      });
      return { results };
    })
});
