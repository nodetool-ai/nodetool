/**
 * Production admin routes — exposes server status, secrets management,
 * and HuggingFace cache management behind ADMIN_TOKEN bearer auth.
 *
 * Only register this plugin in production. The ADMIN_TOKEN environment
 * variable must be set; if it is not, every endpoint returns 503.
 *
 * Auth: Authorization: Bearer <ADMIN_TOKEN>
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { Secret } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.admin");
const execFileAsync = promisify(execFile);

const serverStartTime = Date.now();

// ── Auth helper ────────────────────────────────────────────────────────

function getAdminToken(): string | undefined {
  return process.env["ADMIN_TOKEN"];
}

function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const token = getAdminToken();
  if (!token) {
    reply.status(503).send({
      error: "Admin access not configured",
      detail: "ADMIN_TOKEN environment variable is not set"
    });
    return false;
  }

  const auth = req.headers["authorization"] ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!provided || provided !== token) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }

  return true;
}

// ── HF cache helpers ───────────────────────────────────────────────────

function getHFCacheDir(): string {
  return (
    process.env["HF_HOME"] ??
    process.env["HUGGINGFACE_HUB_CACHE"] ??
    path.join(os.homedir(), ".cache", "huggingface", "hub")
  );
}

async function getDirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += await getDirSize(full);
        } else {
          try {
            const stat = await fs.stat(full);
            total += stat.size;
          } catch {
            // ignore
          }
        }
      })
    );
  } catch {
    // ignore — directory may not exist
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface CacheRepo {
  repo_id: string;
  repo_type: string;
  size_bytes: number;
  size_human: string;
  path: string;
}

async function scanHFCacheDir(cacheDir: string): Promise<CacheRepo[]> {
  const repos: CacheRepo[] = [];

  for (const repoType of ["models", "datasets", "spaces"]) {
    const typeDir = path.join(cacheDir, `hub--${repoType}` === repoType ? "" : "");
    // HF cache structure: <cache_dir>/models--<org>--<repo>
    try {
      const entries = await fs.readdir(cacheDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Match pattern: models--<org>--<name> or datasets--...
        const prefix = `${repoType}--`;
        if (!entry.name.startsWith(prefix)) continue;
        const repoPath = path.join(cacheDir, entry.name);
        const sizeBytes = await getDirSize(repoPath);
        const repoId = entry.name.slice(prefix.length).replace(/--/g, "/");
        repos.push({
          repo_id: repoId,
          repo_type: repoType,
          size_bytes: sizeBytes,
          size_human: formatBytes(sizeBytes),
          path: repoPath
        });
      }
    } catch {
      // ignore — type directory may not exist
    }
    void typeDir; // suppress unused warning
  }

  repos.sort((a, b) => b.size_bytes - a.size_bytes);
  return repos;
}

// ── Plugin ─────────────────────────────────────────────────────────────

const adminRoutes: FastifyPluginAsync = async (app) => {
  // ── Server status ──────────────────────────────────────────────────

  app.get("/admin/status", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const memUsage = process.memoryUsage();
    const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);

    return reply.send({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSec,
      uptime_human: formatUptime(uptimeSec),
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env["NODETOOL_ENV"] ?? "unknown",
      memory: {
        rss_bytes: memUsage.rss,
        rss_human: formatBytes(memUsage.rss),
        heap_used_bytes: memUsage.heapUsed,
        heap_used_human: formatBytes(memUsage.heapUsed),
        heap_total_bytes: memUsage.heapTotal,
        heap_total_human: formatBytes(memUsage.heapTotal)
      },
      providers_configured: getConfiguredProviders()
    });
  });

  // ── Secrets management ─────────────────────────────────────────────

  app.get("/admin/secrets", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    try {
      const secrets = await Secret.listAll(1000);
      return reply.send({
        secrets: secrets.map((s) => s.toSafeObject())
      });
    } catch (err) {
      log.error(
        "Failed to list secrets",
        err instanceof Error ? err : new Error(String(err))
      );
      return reply.status(500).send({ error: "Failed to list secrets" });
    }
  });

  app.post("/admin/secrets", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const body = req.body as Buffer | null;
    if (!body) return reply.status(400).send({ error: "No body" });

    let parsed: { key?: unknown; value?: unknown; description?: unknown };
    try {
      parsed = JSON.parse(body.toString("utf-8")) as typeof parsed;
    } catch {
      return reply.status(400).send({ error: "Invalid JSON" });
    }

    const { key, value, description } = parsed;
    if (typeof key !== "string" || !key.trim()) {
      return reply.status(400).send({ error: "key is required" });
    }
    if (typeof value !== "string") {
      return reply.status(400).send({ error: "value is required" });
    }

    try {
      const secret = await Secret.upsert({
        userId: "1",
        key: key.trim(),
        value,
        description: typeof description === "string" ? description : undefined
      });
      return reply.status(201).send(secret.toSafeObject());
    } catch (err) {
      log.error(
        "Failed to upsert secret",
        err instanceof Error ? err : new Error(String(err))
      );
      return reply.status(500).send({ error: "Failed to save secret" });
    }
  });

  app.delete("/admin/secrets/:key", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { key } = req.params as { key: string };
    const deleted = await Secret.deleteSecret("1", decodeURIComponent(key));
    if (!deleted) {
      return reply.status(404).send({ error: "Secret not found" });
    }
    return reply.status(200).send({ deleted: true, key });
  });

  // ── HF Cache ───────────────────────────────────────────────────────

  app.get("/admin/cache/size", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const cacheDir = getHFCacheDir();
    const sizeBytes = await getDirSize(cacheDir);
    return reply.send({
      cache_dir: cacheDir,
      size_bytes: sizeBytes,
      size_human: formatBytes(sizeBytes)
    });
  });

  app.get("/admin/cache/repos", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const cacheDir = getHFCacheDir();
    const repos = await scanHFCacheDir(cacheDir);
    const totalBytes = repos.reduce((sum, r) => sum + r.size_bytes, 0);
    return reply.send({
      cache_dir: cacheDir,
      total_size_bytes: totalBytes,
      total_size_human: formatBytes(totalBytes),
      repos
    });
  });

  app.delete("/admin/cache/repos/:repoId", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { repoId } = req.params as { repoId: string };
    const decoded = decodeURIComponent(repoId);
    const cacheDir = getHFCacheDir();

    // Search all repo types
    for (const repoType of ["models", "datasets", "spaces"]) {
      const dirName = `${repoType}--${decoded.replace(/\//g, "--")}`;
      const repoPath = path.join(cacheDir, dirName);
      try {
        await fs.access(repoPath);
        await fs.rm(repoPath, { recursive: true, force: true });
        return reply.send({ deleted: true, repo_id: decoded, repo_type: repoType });
      } catch {
        // not this type, try next
      }
    }

    return reply.status(404).send({ error: "Cached repo not found", repo_id: decoded });
  });

  // ── Environment info ───────────────────────────────────────────────

  app.get("/admin/environment", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    return reply.send({
      environment: process.env["NODETOOL_ENV"] ?? "unknown",
      providers: getConfiguredProviders(),
      settings: getSafeSettings()
    });
  });

  // ── Disk usage ─────────────────────────────────────────────────────

  app.get("/admin/disk", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    try {
      // Use df to get disk usage — available on Linux/macOS
      const { stdout } = await execFileAsync("df", ["-B1", "/"], {
        timeout: 5000
      });
      const lines = stdout.trim().split("\n");
      const dataLine = lines[1];
      if (dataLine) {
        const parts = dataLine.split(/\s+/);
        const total = parseInt(parts[1] ?? "0", 10);
        const used = parseInt(parts[2] ?? "0", 10);
        const avail = parseInt(parts[3] ?? "0", 10);
        return reply.send({
          total_bytes: total,
          total_human: formatBytes(total),
          used_bytes: used,
          used_human: formatBytes(used),
          available_bytes: avail,
          available_human: formatBytes(avail),
          use_percent: total > 0 ? Math.round((used / total) * 100) : 0
        });
      }
    } catch {
      // df may not be available
    }

    return reply.send({ error: "Disk info not available on this platform" });
  });
};

// ── Helpers ────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface ProviderInfo {
  name: string;
  configured: boolean;
  env_var: string;
}

function getConfiguredProviders(): ProviderInfo[] {
  const providers: Array<{ name: string; env_var: string }> = [
    { name: "OpenAI", env_var: "OPENAI_API_KEY" },
    { name: "Anthropic", env_var: "ANTHROPIC_API_KEY" },
    { name: "Google Gemini", env_var: "GOOGLE_API_KEY" },
    { name: "Mistral", env_var: "MISTRAL_API_KEY" },
    { name: "Groq", env_var: "GROQ_API_KEY" },
    { name: "Replicate", env_var: "REPLICATE_API_TOKEN" },
    { name: "FAL.ai", env_var: "FAL_KEY" },
    { name: "ElevenLabs", env_var: "ELEVENLABS_API_KEY" },
    { name: "HuggingFace", env_var: "HF_TOKEN" },
    { name: "Supabase", env_var: "SUPABASE_URL" }
  ];

  return providers.map(({ name, env_var }) => ({
    name,
    env_var,
    configured: Boolean(process.env[env_var])
  }));
}

function getSafeSettings(): Record<string, unknown> {
  const keys = [
    "NODETOOL_ENV",
    "NODE_ENV",
    "HOST",
    "PORT",
    "AUTH_PROVIDER",
    "CHAT_PROVIDER",
    "DEFAULT_MODEL",
    "LOG_LEVEL",
    "STATIC_FOLDER",
    "HF_HOME",
    "ASSET_BUCKET",
    "CHROMA_PATH"
  ];

  return Object.fromEntries(
    keys.map((k) => [k, process.env[k] ?? null])
  );
}

export default adminRoutes;
