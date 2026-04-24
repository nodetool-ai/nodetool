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
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { workflowToDsl } from "@nodetool/dsl";
import { initDb, Workflow, Secret, getSecret } from "@nodetool/models";
import { getDefaultDbPath } from "@nodetool/config";
import { WorkflowRunner } from "@nodetool/kernel";
import { NodeRegistry } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerElevenLabsNodes } from "@nodetool/elevenlabs-nodes";
import { registerFalNodes } from "@nodetool/fal-nodes";
import { registerReplicateNodes } from "@nodetool/replicate-nodes";
import { ProcessingContext } from "@nodetool/runtime";
import { registerPackageCommands } from "./commands/package.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// DB setup (for secrets commands)
// ---------------------------------------------------------------------------

async function setupDb(): Promise<void> {
  try {
    initDb(getDefaultDbPath());
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

async function apiGetText(apiUrl: string, path: string): Promise<string> {
  const res = await fetch(`${apiUrl}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.text();
}

async function apiPost(
  apiUrl: string,
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

function printTable(rows: Record<string, unknown>[], columns?: string[]): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join("│");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(
      cols
        .map((c, i) => ` ${String(row[c] ?? "").padEnd(widths[i]!)} `)
        .join("│")
    );
  }
}

function asJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------

program.name("nodetool").description("NodeTool CLI").version("0.1.0");

// ---------------------------------------------------------------------------
// run — execute a TypeScript/JavaScript DSL workflow file
// ---------------------------------------------------------------------------

program
  .command("run <dsl-file>")
  .description("Run a TypeScript/JavaScript DSL workflow file")
  .option("--json", "Output results as JSON (default: pretty-print)")
  .action(async (dslFile: string, opts: { json?: boolean }) => {
    try {
      const { resolve } = await import("node:path");
      const { runDslFile } = await import("./run-dsl.js");
      const { registerBaseNodes } = await import("@nodetool/base-nodes");
      const { NodeRegistry } = await import("@nodetool/node-sdk");

      registerBaseNodes(NodeRegistry.global);

      const absolutePath = resolve(dslFile);
      const results = await runDslFile(absolutePath);

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const [workflowName, outputs] of Object.entries(results)) {
          console.log(`\n${workflowName}:`);
          for (const [key, value] of Object.entries(outputs)) {
            console.log(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

program
  .command("info")
  .description("Display system and environment information")
  .option("--json", "Output as JSON")
  .action((opts) => {
    const apiKeys = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "MISTRAL_API_KEY",
      "GROQ_API_KEY",
      "OLLAMA_API_URL",
      "SERPAPI_API_KEY",
      "HF_TOKEN"
    ];
    const data = {
      version: "0.1.0",
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      api_keys: Object.fromEntries(
        apiKeys.map((k) => [k, process.env[k] ? "configured" : "not set"])
      ),
      environment: {
        ENV: process.env["ENV"] ?? "development",
        LOG_LEVEL: process.env["LOG_LEVEL"] ?? "INFO",
        PORT: process.env["PORT"] ?? "7777"
      }
    };
    if (opts.json) {
      asJson(data);
      return;
    }

    console.log("\nNodeTool System Information\n");
    printTable([
      { property: "Version", value: data.version },
      { property: "Node.js", value: data.node_version },
      { property: "Platform", value: `${data.platform}/${data.arch}` }
    ]);
    console.log("\nAPI Keys:");
    printTable(
      Object.entries(data.api_keys).map(([k, v]) => ({ key: k, status: v }))
    );
    console.log("\nEnvironment:");
    printTable(
      Object.entries(data.environment).map(([k, v]) => ({
        variable: k,
        value: v
      }))
    );
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
      env: { ...process.env }
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
      env: { ...process.env }
    });
    process.exit(result.status ?? 0);
  });

// ---------------------------------------------------------------------------
// workflows
// ---------------------------------------------------------------------------

const workflows = program
  .command("workflows")
  .description("Workflow management");

workflows
  .command("list")
  .description("List workflows")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--limit <n>", "Max results", "100")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const data = (await apiGet(
        opts.apiUrl,
        `/api/workflows?limit=${opts.limit}`
      )) as { workflows?: unknown[] };
      const rows = (data.workflows ?? []) as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(
        rows.map((r) => ({
          id: r["id"],
          name: r["name"],
          updated_at: r["updated_at"]
        }))
      );
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

workflows
  .command("get <workflow_id>")
  .description("Get a workflow by ID")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--json", "Output as JSON")
  .action(async (workflowId, opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/workflows/${workflowId}`);
      if (opts.json) {
        asJson(data);
        return;
      }
      const w = data as Record<string, unknown>;
      printTable([
        {
          id: w["id"],
          name: w["name"],
          description: w["description"],
          updated_at: w["updated_at"]
        }
      ]);
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

workflows
  .command("run <workflow_id_or_file>")
  .description("Run a workflow by ID, JSON file, or TypeScript DSL file")
  .option("--params <json>", "JSON params string")
  .option("--json", "Output as JSON")
  .action(
    async (idOrFile: string, opts: { params?: string; json?: boolean }) => {
      try {
        await setupDb();
        let graph: { nodes: any[]; edges: any[] };
        let workflowId: string | null = null;
        const params = opts.params
          ? (JSON.parse(opts.params) as Record<string, unknown>)
          : {};

        // Determine if argument is a file path or workflow ID
        if (
          idOrFile.endsWith(".json") ||
          idOrFile.endsWith(".ts") ||
          idOrFile.endsWith(".tsx") ||
          idOrFile.includes("/") ||
          idOrFile.includes("\\")
        ) {
          let raw: any;
          if (idOrFile.endsWith(".ts") || idOrFile.endsWith(".tsx")) {
            // Execute DSL file via tsx and capture JSON output
            const { execSync } = await import("node:child_process");
            const output = execSync(`npx tsx "${resolve(idOrFile)}"`, {
              encoding: "utf8",
              cwd: dirname(resolve(idOrFile)),
              timeout: 30000
            });
            raw = JSON.parse(output.trim());
          } else {
            const { readFileSync } = await import("node:fs");
            raw = JSON.parse(readFileSync(idOrFile, "utf8"));
          }
          graph = raw.graph ?? raw;
          workflowId = raw.workflow_id ?? raw.id ?? null;
          if (raw.params) Object.assign(params, raw.params);
        } else {
          // Load from database
          const wf = await Workflow.get(idOrFile);
          if (!wf) throw new Error(`Workflow not found: ${idOrFile}`);
          graph = (wf as any).graph;
          workflowId = idOrFile;
        }

        if (!graph?.nodes || !graph?.edges) {
          throw new Error("Invalid workflow: missing nodes or edges");
        }

        // Normalize graph: convert node.data → node.properties (kernel format)
        graph.nodes = graph.nodes.map((n: Record<string, unknown>) => {
          if (n.properties === undefined && n.data !== undefined) {
            const { data, ...rest } = n;
            return { ...rest, properties: data };
          }
          return n;
        });

        // Set up node registry
        const registry = new NodeRegistry();
        registerBaseNodes(registry);
        registerElevenLabsNodes(registry);
        registerFalNodes(registry);
        registerReplicateNodes(registry);

        // Create processing context with secret resolver
        const jobId = `job-${Date.now()}`;
        const context = new ProcessingContext({
          jobId,
          workflowId,
          userId: "1",
          secretResolver: getSecret
        });

        // Run workflow
        const runner = new WorkflowRunner(jobId, {
          resolveExecutor: (node: { id: string; type: string }) => {
            if (!registry.has(node.type))
              throw new Error(`Unknown node type: ${node.type}`);
            return registry.resolve(node);
          },
          executionContext: context
        });

        console.error(
          `Running workflow${workflowId ? ` ${workflowId}` : ""}...`
        );

        const result = await runner.run(
          { job_id: jobId, workflow_id: workflowId ?? undefined, params },
          graph
        );

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Status: ${result.status}`);
          if (result.error) console.error(`Error: ${result.error}`);
          for (const [nodeId, outputs] of Object.entries(
            result.outputs ?? {}
          )) {
            if (Array.isArray(outputs) && outputs.length > 0) {
              console.log(`\nNode ${nodeId}:`);
              for (const out of outputs) {
                console.log(`  ${JSON.stringify(out).slice(0, 200)}`);
              }
            }
          }
        }

        process.exit(result.status === "completed" ? 0 : 1);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    }
  );

workflows
  .command("export-dsl <workflow_id_or_file>")
  .description("Export a workflow as TypeScript DSL code")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("-o, --output <file>", "Write the exported DSL to a file")
  .action(
    async (idOrFile: string, opts: { apiUrl: string; output?: string }) => {
      try {
        let source: string;

        if (
          idOrFile.endsWith(".json") ||
          idOrFile.includes("/") ||
          idOrFile.includes("\\")
        ) {
          const { readFileSync } = await import("node:fs");
          const raw = JSON.parse(readFileSync(idOrFile, "utf8")) as Record<
            string,
            unknown
          >;
          const graph = (raw.graph ?? raw) as {
            nodes: Record<string, unknown>[];
            edges: Record<string, unknown>[];
          };
          source = workflowToDsl(graph, {
            workflowName: typeof raw.name === "string" ? raw.name : null
          });
        } else {
          source = await apiGetText(
            opts.apiUrl,
            `/api/workflows/${idOrFile}/dsl-export`
          );
        }

        if (opts.output) {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(opts.output, source, "utf8");
          console.log(opts.output);
          return;
        }

        console.log(source);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    }
  );

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

const jobs = program.command("jobs").description("Job management");

jobs
  .command("list")
  .description("List jobs")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--workflow-id <id>", "Filter by workflow ID")
  .option("--limit <n>", "Max results", "100")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const qs = new URLSearchParams({ limit: opts.limit });
      if (opts.workflowId) qs.set("workflow_id", opts.workflowId);
      const data = (await apiGet(opts.apiUrl, `/api/jobs?${qs}`)) as {
        jobs?: unknown[];
      };
      const rows = (data.jobs ?? []) as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(
        rows.map((r) => ({
          id: r["id"],
          status: r["status"],
          workflow_id: r["workflow_id"],
          started_at: r["started_at"]
        }))
      );
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

jobs
  .command("get <job_id>")
  .description("Get a job by ID")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--json", "Output as JSON")
  .action(async (jobId, opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/jobs/${jobId}`);
      if (opts.json) {
        asJson(data);
        return;
      }
      const j = data as Record<string, unknown>;
      printTable([
        {
          id: j["id"],
          status: j["status"],
          workflow_id: j["workflow_id"],
          error: j["error"] ?? ""
        }
      ]);
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

const assets = program.command("assets").description("Asset management");

assets
  .command("list")
  .description("List assets")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--query <q>", "Search query")
  .option("--content-type <type>", "Filter by content type")
  .option("--limit <n>", "Max results", "100")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const qs = new URLSearchParams({ limit: opts.limit });
      if (opts.query) qs.set("query", opts.query);
      if (opts.contentType) qs.set("content_type", opts.contentType);
      const data = (await apiGet(opts.apiUrl, `/api/assets?${qs}`)) as {
        assets?: unknown[];
      };
      const rows = (data.assets ?? []) as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(
        rows.map((r) => ({
          id: r["id"],
          name: r["name"],
          content_type: r["content_type"],
          size: r["size"]
        }))
      );
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

assets
  .command("get <asset_id>")
  .description("Get an asset by ID")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--json", "Output as JSON")
  .action(async (assetId, opts) => {
    try {
      const data = await apiGet(opts.apiUrl, `/api/assets/${assetId}`);
      if (opts.json) {
        asJson(data);
        return;
      }
      const a = data as Record<string, unknown>;
      printTable([
        {
          id: a["id"],
          name: a["name"],
          content_type: a["content_type"],
          size: a["size"],
          url: a["url"]
        }
      ]);
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// secrets
// ---------------------------------------------------------------------------

const secrets = program
  .command("secrets")
  .description("Manage encrypted secrets");

secrets
  .command("list")
  .description("List stored secret keys (values are never shown)")
  .option("--user-id <id>", "User ID", "1")
  .action(async (opts) => {
    await setupDb();
    try {
      const [items] = await Secret.listForUser(opts.userId, 100);
      if (items.length === 0) {
        console.log("No secrets stored.");
        return;
      }
      printTable(
        items.map((s) => ({ key: s.key, updated_at: s.updated_at ?? "" }))
      );
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

secrets
  .command("store <key>")
  .description("Store or update a secret (prompts for value)")
  .option("--user-id <id>", "User ID", "1")
  .option("--description <desc>", "Optional description")
  .action(async (key, opts) => {
    await setupDb();
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr
    });
    const value = await new Promise<string>((resolve) => {
      process.stderr.write(`Enter value for '${key}': `);
      rl.question("", (ans) => {
        rl.close();
        resolve(ans);
      });
    });
    try {
      await Secret.upsert({
        userId: opts.userId,
        key,
        value,
        description: opts.description
      });
      console.log(`Secret '${key}' stored.`);
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

secrets
  .command("get <key>")
  .description("Retrieve and print a secret value")
  .option("--user-id <id>", "User ID", "1")
  .action(async (key, opts) => {
    await setupDb();
    try {
      const value = await getSecret(key, opts.userId);
      if (value == null) {
        console.error(`Secret '${key}' not found.`);
        process.exit(1);
      }
      console.log(value);
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

const settings = program
  .command("settings")
  .description("View configuration settings");

settings
  .command("show")
  .description("Show current settings from environment")
  .option("--json", "Output as JSON")
  .action((opts) => {
    const vars = [
      "ENV",
      "LOG_LEVEL",
      "PORT",
      "HOST",
      "DB_PATH",
      "NODETOOL_API_URL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "MISTRAL_API_KEY",
      "GROQ_API_KEY",
      "OLLAMA_API_URL",
      "SERPAPI_API_KEY",
      "HF_TOKEN",
      "VECTORSTORE_DB_PATH",
      "ASSET_BUCKET",
      "S3_ENDPOINT_URL"
    ];
    const data = Object.fromEntries(
      vars.map((k) => [
        k,
        process.env[k]
          ? k.endsWith("KEY") || k.endsWith("TOKEN")
            ? "***"
            : process.env[k]!
          : ""
      ])
    );
    if (opts.json) {
      asJson(data);
      return;
    }
    printTable(
      Object.entries(data).map(([variable, value]) => ({ variable, value }))
    );
  });

// ---------------------------------------------------------------------------
// mcp
// ---------------------------------------------------------------------------

const mcp = program
  .command("mcp")
  .description("MCP server integration for AI coding assistants");

mcp
  .command("install")
  .description(
    "Install NodeTool MCP server config for Claude Code, Codex, and/or OpenCode"
  )
  .option("--url <url>", "MCP server URL", "http://127.0.0.1:7777/mcp")
  .option("--claude", "Install for Claude Code only")
  .option("--codex", "Install for Codex only")
  .option("--opencode", "Install for OpenCode only")
  .action(
    async (opts: {
      url: string;
      claude?: boolean;
      codex?: boolean;
      opencode?: boolean;
    }) => {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } =
        await import("node:fs");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");

      const home = homedir();
      const mcpUrl = opts.url;
      const installAll = !opts.claude && !opts.codex && !opts.opencode;

      const results: { target: string; status: string }[] = [];

      // ── Claude Code ──────────────────────────────────────────────
      if (installAll || opts.claude) {
        try {
          const claudeConfigPath = join(home, ".claude.json");
          let config: Record<string, unknown> = {};
          if (existsSync(claudeConfigPath)) {
            config = JSON.parse(readFileSync(claudeConfigPath, "utf8"));
          }

          // Install globally under projects."~" which applies to all projects
          const projects = (config["projects"] ?? {}) as Record<
            string,
            Record<string, unknown>
          >;
          const globalProject = projects[home] ?? {};
          const mcpServers = (globalProject["mcpServers"] ?? {}) as Record<
            string,
            unknown
          >;

          mcpServers["nodetool"] = {
            type: "http",
            url: mcpUrl
          };

          globalProject["mcpServers"] = mcpServers;
          projects[home] = globalProject;
          config["projects"] = projects;

          writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2) + "\n");
          results.push({ target: "Claude Code", status: `Installed → ${claudeConfigPath}` });
        } catch (e) {
          results.push({ target: "Claude Code", status: `Error: ${e}` });
        }
      }

      // ── Codex ────────────────────────────────────────────────────
      if (installAll || opts.codex) {
        try {
          const codexDir = join(home, ".codex");
          const codexConfigPath = join(codexDir, "config.toml");
          mkdirSync(codexDir, { recursive: true });

          const NODETOOL_MCP_BEGIN = "# BEGIN NODETOOL MCP";
          const NODETOOL_MCP_END = "# END NODETOOL MCP";

          const mcpBlock = [
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
          if (existsSync(codexConfigPath)) {
            content = readFileSync(codexConfigPath, "utf8");
            const re = new RegExp(
              `${NODETOOL_MCP_BEGIN}[\\s\\S]*?${NODETOOL_MCP_END}\\n?`
            );
            if (re.test(content)) {
              content = content.replace(re, mcpBlock + "\n");
            } else {
              content = content.trimEnd() + "\n\n" + mcpBlock + "\n";
            }
          } else {
            content = mcpBlock + "\n";
          }

          writeFileSync(codexConfigPath, content);
          results.push({ target: "Codex", status: `Installed → ${codexConfigPath}` });
        } catch (e) {
          results.push({ target: "Codex", status: `Error: ${e}` });
        }
      }

      // ── OpenCode ─────────────────────────────────────────────────
      if (installAll || opts.opencode) {
        try {
          const opencodeDir = join(home, ".config", "opencode");
          const opencodeConfigPath = join(opencodeDir, "opencode.json");
          mkdirSync(opencodeDir, { recursive: true });

          let config: Record<string, unknown> = {};
          if (existsSync(opencodeConfigPath)) {
            config = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
          }

          const mcpConfig = (config["mcp"] ?? {}) as Record<string, unknown>;
          mcpConfig["nodetool"] = {
            type: "remote",
            url: mcpUrl
          };
          config["mcp"] = mcpConfig;

          writeFileSync(
            opencodeConfigPath,
            JSON.stringify(config, null, 2) + "\n"
          );
          results.push({ target: "OpenCode", status: `Installed → ${opencodeConfigPath}` });
        } catch (e) {
          results.push({ target: "OpenCode", status: `Error: ${e}` });
        }
      }

      console.log(`\nNodeTool MCP Server: ${mcpUrl}\n`);
      printTable(results);
      console.log(
        "\nMake sure the NodeTool server is running (nodetool serve) for MCP to work.\n"
      );
    }
  );

mcp
  .command("uninstall")
  .description("Remove NodeTool MCP server config from all AI coding assistants")
  .option("--claude", "Uninstall from Claude Code only")
  .option("--codex", "Uninstall from Codex only")
  .option("--opencode", "Uninstall from OpenCode only")
  .action(
    async (opts: { claude?: boolean; codex?: boolean; opencode?: boolean }) => {
      const { readFileSync, writeFileSync, existsSync } = await import(
        "node:fs"
      );
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");

      const home = homedir();
      const uninstallAll = !opts.claude && !opts.codex && !opts.opencode;
      const results: { target: string; status: string }[] = [];

      // ── Claude Code ──────────────────────────────────────────────
      if (uninstallAll || opts.claude) {
        try {
          const claudeConfigPath = join(home, ".claude.json");
          if (existsSync(claudeConfigPath)) {
            const config = JSON.parse(readFileSync(claudeConfigPath, "utf8"));
            const projects = config["projects"] ?? {};
            const globalProject = projects[home] ?? {};
            const mcpServers = globalProject["mcpServers"] ?? {};
            if ("nodetool" in mcpServers) {
              delete mcpServers["nodetool"];
              globalProject["mcpServers"] = mcpServers;
              projects[home] = globalProject;
              config["projects"] = projects;
              writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2) + "\n");
              results.push({ target: "Claude Code", status: "Removed" });
            } else {
              results.push({ target: "Claude Code", status: "Not installed" });
            }
          } else {
            results.push({ target: "Claude Code", status: "Config not found" });
          }
        } catch (e) {
          results.push({ target: "Claude Code", status: `Error: ${e}` });
        }
      }

      // ── Codex ────────────────────────────────────────────────────
      if (uninstallAll || opts.codex) {
        try {
          const codexConfigPath = join(home, ".codex", "config.toml");
          if (existsSync(codexConfigPath)) {
            let content = readFileSync(codexConfigPath, "utf8");
            const re = /# BEGIN NODETOOL MCP[\s\S]*?# END NODETOOL MCP\n?/;
            if (re.test(content)) {
              content = content.replace(re, "").trimEnd() + "\n";
              writeFileSync(codexConfigPath, content);
              results.push({ target: "Codex", status: "Removed" });
            } else {
              results.push({ target: "Codex", status: "Not installed" });
            }
          } else {
            results.push({ target: "Codex", status: "Config not found" });
          }
        } catch (e) {
          results.push({ target: "Codex", status: `Error: ${e}` });
        }
      }

      // ── OpenCode ─────────────────────────────────────────────────
      if (uninstallAll || opts.opencode) {
        try {
          const opencodeConfigPath = join(
            home,
            ".config",
            "opencode",
            "opencode.json"
          );
          if (existsSync(opencodeConfigPath)) {
            const config = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
            const mcpConfig = config["mcp"] ?? {};
            if ("nodetool" in mcpConfig) {
              delete mcpConfig["nodetool"];
              config["mcp"] = mcpConfig;
              writeFileSync(
                opencodeConfigPath,
                JSON.stringify(config, null, 2) + "\n"
              );
              results.push({ target: "OpenCode", status: "Removed" });
            } else {
              results.push({ target: "OpenCode", status: "Not installed" });
            }
          } else {
            results.push({ target: "OpenCode", status: "Config not found" });
          }
        } catch (e) {
          results.push({ target: "OpenCode", status: `Error: ${e}` });
        }
      }

      console.log();
      printTable(results);
      console.log();
    }
  );

mcp
  .command("status")
  .description("Show NodeTool MCP installation status for all AI coding assistants")
  .action(async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");

    const home = homedir();
    const results: { target: string; status: string; url: string }[] = [];

    // Claude Code
    try {
      const claudeConfigPath = join(home, ".claude.json");
      if (existsSync(claudeConfigPath)) {
        const config = JSON.parse(readFileSync(claudeConfigPath, "utf8"));
        const mcpServers =
          config?.projects?.[home]?.mcpServers ?? {};
        if (mcpServers["nodetool"]) {
          results.push({
            target: "Claude Code",
            status: "Installed",
            url: mcpServers["nodetool"].url ?? ""
          });
        } else {
          results.push({ target: "Claude Code", status: "Not installed", url: "" });
        }
      } else {
        results.push({ target: "Claude Code", status: "No config", url: "" });
      }
    } catch {
      results.push({ target: "Claude Code", status: "Error reading config", url: "" });
    }

    // Codex
    try {
      const codexConfigPath = join(home, ".codex", "config.toml");
      if (existsSync(codexConfigPath)) {
        const content = readFileSync(codexConfigPath, "utf8");
        const urlMatch = /# BEGIN NODETOOL MCP[\s\S]*?url\s*=\s*"([^"]*)"/.exec(
          content
        );
        if (urlMatch) {
          results.push({
            target: "Codex",
            status: "Installed",
            url: urlMatch[1] ?? ""
          });
        } else {
          results.push({ target: "Codex", status: "Not installed", url: "" });
        }
      } else {
        results.push({ target: "Codex", status: "No config", url: "" });
      }
    } catch {
      results.push({ target: "Codex", status: "Error reading config", url: "" });
    }

    // OpenCode
    try {
      const opencodeConfigPath = join(
        home,
        ".config",
        "opencode",
        "opencode.json"
      );
      if (existsSync(opencodeConfigPath)) {
        const config = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
        if (config?.mcp?.nodetool) {
          results.push({
            target: "OpenCode",
            status: "Installed",
            url: config.mcp.nodetool.url ?? ""
          });
        } else {
          results.push({ target: "OpenCode", status: "Not installed", url: "" });
        }
      } else {
        results.push({ target: "OpenCode", status: "No config", url: "" });
      }
    } catch {
      results.push({ target: "OpenCode", status: "Error reading config", url: "" });
    }

    console.log("\nNodeTool MCP Integration Status\n");
    printTable(results);
    console.log();
  });

// ---------------------------------------------------------------------------
// package
// ---------------------------------------------------------------------------

registerPackageCommands(program);

// ---------------------------------------------------------------------------

program.parse();
