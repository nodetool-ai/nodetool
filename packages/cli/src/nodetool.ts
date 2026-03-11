#!/usr/bin/env node
/**
 * nodetool — Top-level CLI mirroring the Python nodetool CLI.
 *
 * Usage:
 *   nodetool info                          # system/env info
 *   nodetool serve [--host] [--port]       # start TS server
 *   nodetool chat [--url] [--provider]     # interactive chat
 *   nodetool workflows list/get/run
 *   nodetool jobs list/get
 *   nodetool assets list/get
 *   nodetool secrets list/store <key>
 *   nodetool settings show
 */

import { program, Command } from "commander";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import {
  SQLiteAdapterFactory,
  setGlobalAdapterResolver,
  Secret,
} from "@nodetool/models";
import { getSecret } from "@nodetool/security";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// DB setup (for secrets commands)
// ---------------------------------------------------------------------------

async function setupDb(): Promise<void> {
  const dbPath = process.env["DB_PATH"] ?? join(homedir(), ".local", "share", "nodetool", "nodetool.sqlite3");
  try {
    const factory = new SQLiteAdapterFactory(dbPath);
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Secret.createTable();
  } catch {
    // fall back to env vars
  }
}

// ---------------------------------------------------------------------------
// HTTP API helper
// ---------------------------------------------------------------------------

async function apiGet(apiUrl: string, path: string): Promise<unknown> {
  const res = await fetch(`${apiUrl}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(apiUrl: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

function printTable(rows: Record<string, unknown>[], columns?: string[]): void {
  if (rows.length === 0) { console.log("(no results)"); return; }
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? "").length)));
  const sep = widths.map(w => "─".repeat(w + 2)).join("┼");
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join("│");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(cols.map((c, i) => ` ${String(row[c] ?? "").padEnd(widths[i]!)} `).join("│"));
  }
}

function asJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------

program
  .name("nodetool")
  .description("NodeTool CLI")
  .version("0.1.0");

program
  .command("info")
  .description("Display system and environment information")
  .option("--json", "Output as JSON")
  .action((opts) => {
    const apiKeys = [
      "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
      "MISTRAL_API_KEY", "GROQ_API_KEY", "OLLAMA_API_URL",
      "SERPAPI_API_KEY", "HF_TOKEN",
    ];
    const data = {
      version: "0.1.0",
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      api_keys: Object.fromEntries(
        apiKeys.map(k => [k, process.env[k] ? "configured" : "not set"])
      ),
      environment: {
        ENV: process.env["ENV"] ?? "development",
        LOG_LEVEL: process.env["LOG_LEVEL"] ?? "INFO",
        PORT: process.env["PORT"] ?? "7777",
      },
    };
    if (opts.json) { asJson(data); return; }

    console.log("\nNodeTool System Information\n");
    printTable([
      { property: "Version", value: data.version },
      { property: "Node.js", value: data.node_version },
      { property: "Platform", value: `${data.platform}/${data.arch}` },
    ]);
    console.log("\nAPI Keys:");
    printTable(Object.entries(data.api_keys).map(([k, v]) => ({ key: k, status: v })));
    console.log("\nEnvironment:");
    printTable(Object.entries(data.environment).map(([k, v]) => ({ variable: k, value: v })));
    console.log();
  });

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

program
  .command("serve")
  .description("Start the NodeTool WebSocket + HTTP server")
  .option("--host <host>", "Host to bind", "127.0.0.1")
  .option("--port <port>", "Port to listen on", "7777")
  .action((opts) => {
    const serverPath = resolve(__dirname, "../../websocket/dist/server.js");
    process.env["HOST"] = opts.host;
    process.env["PORT"] = opts.port;
    const result = spawnSync("node", [serverPath], {
      stdio: "inherit",
      env: { ...process.env },
    });
    process.exit(result.status ?? 0);
  });

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

program
  .command("chat")
  .description("Start interactive chat (TUI)")
  .option("-p, --provider <provider>", "LLM provider")
  .option("-m, --model <model>", "Model ID")
  .option("-a, --agent", "Agent mode")
  .option("-u, --url <url>", "WebSocket server URL")
  .option("-w, --workspace <path>", "Workspace directory")
  .option("--tools <tools>", "Comma-separated enabled tools")
  .allowUnknownOption()
  .action((_opts, cmd) => {
    const chatPath = resolve(__dirname, "index.js");
    const args = cmd.args;
    const rawArgs = process.argv;
    // Re-run with the chat entry point, forwarding all flags after "chat"
    const chatIdx = rawArgs.indexOf("chat");
    const forwarded = chatIdx >= 0 ? rawArgs.slice(chatIdx + 1) : args;
    const result = spawnSync("node", [chatPath, ...forwarded], {
      stdio: "inherit",
      env: { ...process.env },
    });
    process.exit(result.status ?? 0);
  });

// ---------------------------------------------------------------------------
// workflows
// ---------------------------------------------------------------------------

const workflows = program.command("workflows").description("Workflow management");

workflows
  .command("list")
  .description("List workflows")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--limit <n>", "Max results", "100")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/workflows?limit=${opts.limit}`) as { workflows?: unknown[] };
      const rows = (data.workflows ?? []) as Record<string, unknown>[];
      if (opts.json) { asJson(rows); return; }
      printTable(rows.map(r => ({ id: r["id"], name: r["name"], updated_at: r["updated_at"] })));
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

workflows
  .command("get <workflow_id>")
  .description("Get a workflow by ID")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--json", "Output as JSON")
  .action(async (workflowId, opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/workflows/${workflowId}`);
      if (opts.json) { asJson(data); return; }
      const w = data as Record<string, unknown>;
      printTable([{ id: w["id"], name: w["name"], description: w["description"], updated_at: w["updated_at"] }]);
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

workflows
  .command("run <workflow_id>")
  .description("Run a workflow")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--params <json>", "JSON params string")
  .option("--json", "Output as JSON")
  .action(async (workflowId, opts) => {
    try {
      const params = opts.params ? JSON.parse(opts.params) as Record<string, unknown> : {};
      const data = await apiPost(opts.apiUrl, `/api/workflows/${workflowId}/run`, { params });
      if (opts.json) { asJson(data); return; }
      console.log(JSON.stringify(data, null, 2));
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

const jobs = program.command("jobs").description("Job management");

jobs
  .command("list")
  .description("List jobs")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--workflow-id <id>", "Filter by workflow ID")
  .option("--limit <n>", "Max results", "100")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const qs = new URLSearchParams({ limit: opts.limit });
      if (opts.workflowId) qs.set("workflow_id", opts.workflowId);
      const data = await apiGet(opts.apiUrl, `/api/jobs?${qs}`) as { jobs?: unknown[] };
      const rows = (data.jobs ?? []) as Record<string, unknown>[];
      if (opts.json) { asJson(rows); return; }
      printTable(rows.map(r => ({ id: r["id"], status: r["status"], workflow_id: r["workflow_id"], started_at: r["started_at"] })));
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

jobs
  .command("get <job_id>")
  .description("Get a job by ID")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--json", "Output as JSON")
  .action(async (jobId, opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/jobs/${jobId}`);
      if (opts.json) { asJson(data); return; }
      const j = data as Record<string, unknown>;
      printTable([{ id: j["id"], status: j["status"], workflow_id: j["workflow_id"], error: j["error"] ?? "" }]);
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

const assets = program.command("assets").description("Asset management");

assets
  .command("list")
  .description("List assets")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--query <q>", "Search query")
  .option("--content-type <type>", "Filter by content type")
  .option("--limit <n>", "Max results", "100")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const qs = new URLSearchParams({ limit: opts.limit });
      if (opts.query) qs.set("query", opts.query);
      if (opts.contentType) qs.set("content_type", opts.contentType);
      const data = await apiGet(opts.apiUrl, `/api/assets?${qs}`) as { assets?: unknown[] };
      const rows = (data.assets ?? []) as Record<string, unknown>[];
      if (opts.json) { asJson(rows); return; }
      printTable(rows.map(r => ({ id: r["id"], name: r["name"], content_type: r["content_type"], size: r["size"] })));
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

assets
  .command("get <asset_id>")
  .description("Get an asset by ID")
  .option("--api-url <url>", "API base URL", process.env["NODETOOL_API_URL"] ?? "http://localhost:7777")
  .option("--json", "Output as JSON")
  .action(async (assetId, opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/assets/${assetId}`);
      if (opts.json) { asJson(data); return; }
      const a = data as Record<string, unknown>;
      printTable([{ id: a["id"], name: a["name"], content_type: a["content_type"], size: a["size"], url: a["url"] }]);
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

// ---------------------------------------------------------------------------
// secrets
// ---------------------------------------------------------------------------

const secrets = program.command("secrets").description("Manage encrypted secrets");

secrets
  .command("list")
  .description("List stored secret keys (values are never shown)")
  .option("--user-id <id>", "User ID", "1")
  .action(async (opts) => {
    await setupDb();
    try {
      const [items] = await Secret.listForUser(opts.userId, 100);
      if (items.length === 0) { console.log("No secrets stored."); return; }
      printTable(items.map(s => ({ key: s.key, updated_at: s.updated_at ?? "" })));
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

secrets
  .command("store <key>")
  .description("Store or update a secret (prompts for value)")
  .option("--user-id <id>", "User ID", "1")
  .option("--description <desc>", "Optional description")
  .action(async (key, opts) => {
    await setupDb();
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const value = await new Promise<string>((resolve) => {
      process.stderr.write(`Enter value for '${key}': `);
      rl.question("", (ans) => { rl.close(); resolve(ans); });
    });
    try {
      await Secret.upsert({ userId: opts.userId, key, value, description: opts.description });
      console.log(`Secret '${key}' stored.`);
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

secrets
  .command("get <key>")
  .description("Retrieve and print a secret value")
  .option("--user-id <id>", "User ID", "1")
  .action(async (key, opts) => {
    await setupDb();
    try {
      const value = await getSecret(key, opts.userId);
      if (value == null) { console.error(`Secret '${key}' not found.`); process.exit(1); }
      console.log(value);
    } catch (e) { console.error(String(e)); process.exit(1); }
  });

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

const settings = program.command("settings").description("View configuration settings");

settings
  .command("show")
  .description("Show current settings from environment")
  .option("--json", "Output as JSON")
  .action((opts) => {
    const vars = [
      "ENV", "LOG_LEVEL", "PORT", "HOST",
      "DB_PATH", "NODETOOL_API_URL",
      "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
      "MISTRAL_API_KEY", "GROQ_API_KEY", "OLLAMA_API_URL",
      "SERPAPI_API_KEY", "HF_TOKEN",
      "CHROMA_PATH", "CHROMA_URL",
      "ASSET_BUCKET", "S3_ENDPOINT_URL",
    ];
    const data = Object.fromEntries(
      vars.map(k => [k, process.env[k] ? (k.endsWith("KEY") || k.endsWith("TOKEN") ? "***" : process.env[k]!) : ""])
    );
    if (opts.json) { asJson(data); return; }
    printTable(Object.entries(data).map(([variable, value]) => ({ variable, value })));
  });

// ---------------------------------------------------------------------------

program.parse();
