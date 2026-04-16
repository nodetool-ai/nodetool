/**
 * API routes for managing NodeTool MCP server installation in AI coding
 * assistants (Claude Code, Codex, OpenCode).
 *
 * GET  /api/mcp/status    — installation status for each target
 * POST /api/mcp/install   — install MCP config  { targets?: string[], url?: string }
 * POST /api/mcp/uninstall — remove MCP config   { targets?: string[] }
 */

import type { FastifyPluginAsync } from "fastify";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Target names ───────────────────────────────────────────────────────────

type McpTarget = "claude" | "codex" | "opencode";
const ALL_TARGETS: McpTarget[] = ["claude", "codex", "opencode"];
const TARGET_LABELS: Record<McpTarget, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode"
};

const NODETOOL_MCP_BEGIN = "# BEGIN NODETOOL MCP";
const NODETOOL_MCP_END = "# END NODETOOL MCP";

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultMcpUrl(): string {
  const port = Number(process.env["PORT"] ?? 7777);
  const tlsEnabled = Boolean(
    process.env["TLS_CERT"] && process.env["TLS_KEY"]
  );
  return `${tlsEnabled ? "https" : "http"}://127.0.0.1:${port}/mcp`;
}

interface TargetStatus {
  target: McpTarget;
  label: string;
  installed: boolean;
  url: string | null;
  configPath: string | null;
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

function install(target: McpTarget, mcpUrl: string): string {
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

function uninstall(target: McpTarget): boolean {
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

// ── Fastify plugin ─────────────────────────────────────────────────────────

function resolveTargets(raw: unknown): McpTarget[] {
  if (!Array.isArray(raw) || raw.length === 0) return ALL_TARGETS;
  return raw.filter((t): t is McpTarget =>
    ALL_TARGETS.includes(t as McpTarget)
  );
}

const mcpConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/mcp/status", async (_req, reply) => {
    const statuses = ALL_TARGETS.map(getStatus);
    reply.send({ targets: statuses, defaultUrl: defaultMcpUrl() });
  });

  app.post("/api/mcp/install", async (req, reply) => {
    const body = (
      Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body ?? {}
    ) as { targets?: unknown; url?: string };
    const targets = resolveTargets(body.targets);
    const mcpUrl = body.url ?? defaultMcpUrl();

    const results = targets.map((t) => {
      try {
        const configPath = install(t, mcpUrl);
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
    reply.send({ results, url: mcpUrl });
  });

  app.post("/api/mcp/uninstall", async (req, reply) => {
    const body = (
      Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body ?? {}
    ) as { targets?: unknown };
    const targets = resolveTargets(body.targets);

    const results = targets.map((t) => {
      try {
        const removed = uninstall(t);
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
    reply.send({ results });
  });
};

export default mcpConfigRoutes;
