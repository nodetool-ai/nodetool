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
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { workflowToDsl } from "@nodetool-ai/dsl";
import { initDb, Workflow, Secret, getSecret } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { getDefaultDbPath, getDefaultAssetsPath } from "@nodetool-ai/config";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { hydrateGraphNodeFlags, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { registerElevenLabsNodes } from "@nodetool-ai/elevenlabs-nodes";
import { registerMinimaxNodes } from "@nodetool-ai/minimax-nodes";
import { registerTransformersJsNodes } from "@nodetool-ai/transformers-js-nodes";
import { registerFalNodes } from "@nodetool-ai/fal-nodes";
import { registerReplicateNodes } from "@nodetool-ai/replicate-nodes";
import { registerReveNodes } from "@nodetool-ai/reve-nodes";
import { registerHuggingFaceNodes } from "@nodetool-ai/huggingface-nodes";
import {
  ProcessingContext,
  FileStorageAdapter,
  initTelemetry,
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "@nodetool-ai/runtime";
import { registerPackageCommands } from "./commands/package.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerHfCommands } from "./commands/models-hf.js";
import { registerWorkerCommands } from "./commands/worker.js";
import { registerRecommendedCommand } from "./commands/models-recommended.js";
import { registerAgentCommands } from "./commands/agent.js";
import { registerDbCommands } from "./commands/db.js";
import { registerDebugCommands } from "./commands/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// DB setup (for secrets commands)
// ---------------------------------------------------------------------------

async function setupDb(): Promise<void> {
  initDb(getDefaultDbPath());
  // Resolve the master encryption key from keychain / env / AWS so that
  // both encryption (Secret.upsert) and decryption (Secret.getDecryptedValue)
  // use the same persistent key. Without this, a fresh process would
  // auto-generate a one-shot key inside `getMasterKey()`, encrypt with it,
  // then lose it on exit — and the next launch could not decrypt.
  try {
    await initMasterKey();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Could not unlock the secret store: ${msg}\n` +
        `Tip: set SECRETS_MASTER_KEY or grant keychain access.\n`
    );
  }
}

// ---------------------------------------------------------------------------
// API clients
// ---------------------------------------------------------------------------

function createApiClient(apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        transformer: superjson
      })
    ]
  });
}

// REST GET (text) — used for the DSL export endpoint which stays REST
// because it returns a TypeScript source string rather than JSON.
async function apiGetText(apiUrl: string, path: string): Promise<string> {
  const res = await fetch(`${apiUrl}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.text();
}

// This CLI's package version, stamped into exported bundle manifests.
function cliVersion(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    return (req("../package.json") as { version?: string }).version;
  } catch {
    // Version is best-effort metadata; omit it if the file can't be read.
    return undefined;
  }
}

// Download asset bytes from a running server, used by the export commands to
// resolve `asset://` / `/api/storage/` (and optionally http) refs into bytes.
function makeAssetFetcher(
  apiUrl: string
): (ref: string) => Promise<Uint8Array | null> {
  return async (ref: string): Promise<Uint8Array | null> => {
    let url: string | null = null;
    if (ref.startsWith("asset://")) {
      const id = ref.slice("asset://".length);
      const bareId = id.replace(/\.[^.]+$/, "");
      try {
        const meta = await fetch(
          `${apiUrl}/api/assets/${encodeURIComponent(bareId)}`
        );
        if (meta.ok) {
          const j = (await meta.json()) as { get_url?: string };
          if (j.get_url) {
            url = j.get_url.startsWith("/") ? `${apiUrl}${j.get_url}` : j.get_url;
          }
        }
      } catch {
        // Metadata lookup failed — fall back to the storage route below.
      }
      url ??= `${apiUrl}/api/storage/${encodeURIComponent(id)}`;
    } else if (ref.includes("/api/storage/")) {
      url = /^https?:\/\//.test(ref)
        ? ref
        : `${apiUrl}${ref.startsWith("/") ? ref : `/${ref}`}`;
    } else if (/^https?:\/\//.test(ref)) {
      url = ref;
    }
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  };
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

program
  .name("nodetool")
  .description("NodeTool CLI")
  .version("0.1.0")
  .option(
    "--trace-file <path>",
    "Append every LLM/agent/workflow span as JSONL to <path>"
  )
  .option(
    "--trace-stdout [format]",
    "Stream spans to stdout: 'pretty' (default) or 'json' (JSONL)"
  )
  .option(
    "--no-trace-stdout",
    "Disable stdout span output (overrides NODETOOL_TRACE_STDOUT)"
  )
  .hook("preAction", async (thisCommand, actionCommand) => {
    // With `--trace`, the `debug` command owns telemetry: it routes spans into
    // its bundle's trace.jsonl via its own initTelemetry call. Initializing here
    // first would win the one-shot init and drop that file sink, so skip it.
    // Without `--trace`, fall through so the global --trace-file/--trace-stdout
    // flags still work for a debug run.
    if (actionCommand?.name() === "debug" && actionCommand.opts()["trace"]) return;
    const opts = thisCommand.opts<{
      traceFile?: string;
      traceStdout?: string | boolean;
    }>();
    await initTelemetry({
      ...(opts.traceFile && { traceFile: opts.traceFile }),
      ...(opts.traceStdout !== undefined && {
        stdout: parseTraceStdout(opts.traceStdout)
      })
    });
  });

function parseTraceStdout(v: string | boolean): "pretty" | "json" | false {
  if (v === false) return false;
  if (v === true) return "pretty";
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "false" || lower === "0" || lower === "no") return false;
    if (lower === "json") return "json";
    if (lower === "pretty" || lower === "true" || lower === "1") return "pretty";
  }
  throw new Error(
    `--trace-stdout must be 'pretty' or 'json' (got ${JSON.stringify(v)})`
  );
}

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
      const { registerBaseNodes } = await import("@nodetool-ai/base-nodes");
      const { NodeRegistry } = await import("@nodetool-ai/node-sdk");

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
      const client = createApiClient(opts.apiUrl);
      const data = await client.workflows.list.query({
        limit: Number.parseInt(opts.limit, 10)
      });
      const rows = data.workflows as Record<string, unknown>[];
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
      const client = createApiClient(opts.apiUrl);
      const data = await client.workflows.get.query({ id: workflowId });
      if (opts.json) {
        asJson(data);
        return;
      }
      const w = data as unknown as Record<string, unknown>;
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
        registerMinimaxNodes(registry);
        registerTransformersJsNodes(registry);
        registerFalNodes(registry);
        registerReplicateNodes(registry);
        registerReveNodes(registry);
        registerHuggingFaceNodes(registry);

        // Create processing context with secret resolver
        const jobId = `job-${Date.now()}`;
        // Resolve asset URIs (e.g. /api/storage/<key>) against the local
        // assets directory, so workflows referencing stored assets run the
        // same decode path the server does.
        // Apply the workflow's assigned workspace (if any) so file ops and
        // workspace-driving nodes land in the same directory as a server run.
        const { resolveWorkflowWorkspace } = await import(
          "@nodetool-ai/websocket"
        );
        const workspaceDir = workflowId
          ? await resolveWorkflowWorkspace(workflowId, "1")
          : null;
        const context = new ProcessingContext({
          jobId,
          workflowId,
          userId: "1",
          secretResolver: getSecret,
          storage: new FileStorageAdapter(getDefaultAssetsPath()),
          workspaceDir,
          workspaceStorage: workspaceDir
            ? new FileStorageAdapter(workspaceDir)
            : null
        });

        // Connect a Python worker bridge when the graph has non-TS (Python)
        // nodes. Transport: NODETOOL_WORKER_URL (+ NODETOOL_WORKER_TOKEN) →
        // remote worker; unset → local stdio worker. Pure-TS graphs get none.
        const pythonBridge = await connectPythonBridgeForGraph(
          graph.nodes,
          (t) => registry.has(t)
        );

        // Run workflow
        const runner = new WorkflowRunner(jobId, {
          resolveExecutor: (node: { id: string; type: string }) => {
            if (registry.has(node.type)) return registry.resolve(node);
            const py = resolvePythonNodeExecutor(pythonBridge, node);
            if (py) return py;
            throw new Error(`Unknown node type: ${node.type}`);
          },
          executionContext: context
        });

        console.error(
          `Running workflow${workflowId ? ` ${workflowId}` : ""}...`
        );

        const result = await (async () => {
          try {
            return await runner.run(
              {
                job_id: jobId,
                workflow_id: workflowId ?? undefined,
                params
              },
              // Saved workflow JSON carries no behavior flags; stamp them
              // from the registry or streaming nodes run as one-shots.
              hydrateGraphNodeFlags(graph as GraphData, registry)
            );
          } finally {
            pythonBridge?.close();
          }
        })();

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

workflows
  .command("export-example <workflow_id_or_file>")
  .description(
    "Export a workflow as a shipped template: materialize its assets into the " +
      "package's constant asset dir (package:// refs) and write the example JSON"
  )
  .option(
    "--api-url <url>",
    "API base URL (used to fetch the workflow and asset bytes by id)",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--package <name>", "Owning package", "nodetool-base")
  .option(
    "--assets-dir <dir>",
    "Root holding <package>/<file> constant assets (defaults to the monorepo base-nodes assets dir)"
  )
  .option(
    "--examples-dir <dir>",
    "Directory the example JSON is written under, as <dir>/<package>/<name>.json"
  )
  .option("-o, --output <file>", "Write the example JSON to this exact path")
  .option(
    "--include-remote",
    "Also materialize http(s) and local-file refs (off by default)"
  )
  .action(
    async (
      idOrFile: string,
      opts: {
        apiUrl: string;
        package: string;
        assetsDir?: string;
        examplesDir?: string;
        output?: string;
        includeRemote?: boolean;
      }
    ) => {
      try {
        const { readFileSync } = await import("node:fs");
        const { mkdir, writeFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { materializeWorkflowConstantAssets } = await import(
          "@nodetool-ai/websocket"
        );

        let name = "";
        let description = "";
        let tags: string[] = [];
        let graph: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };

        const isFile =
          idOrFile.endsWith(".json") ||
          idOrFile.includes("/") ||
          idOrFile.includes("\\");

        if (isFile) {
          const raw = JSON.parse(readFileSync(idOrFile, "utf8")) as Record<
            string,
            unknown
          >;
          name = typeof raw.name === "string" ? raw.name : "workflow";
          description = typeof raw.description === "string" ? raw.description : "";
          tags = Array.isArray(raw.tags)
            ? raw.tags.filter((t): t is string => typeof t === "string")
            : [];
          graph = (raw.graph ?? raw) as typeof graph;
        } else {
          const client = createApiClient(opts.apiUrl);
          const wf = (await client.workflows.get.query({
            id: idOrFile
          })) as Record<string, unknown>;
          name = typeof wf.name === "string" ? wf.name : "workflow";
          description = typeof wf.description === "string" ? wf.description : "";
          tags = Array.isArray(wf.tags)
            ? wf.tags.filter((t): t is string => typeof t === "string")
            : [];
          graph = wf.graph as typeof graph;
        }

        if (!graph?.nodes) {
          throw new Error("Workflow has no graph to export");
        }

        const repoRoot = resolve(__dirname, "..", "..", "..");
        const baseNodesDir = join(
          repoRoot,
          "packages",
          "base-nodes",
          "nodetool"
        );
        const assetsRoot = opts.assetsDir ?? join(baseNodesDir, "assets");
        const examplesDir = opts.examplesDir ?? join(baseNodesDir, "examples");

        const apiUrl = opts.apiUrl.replace(/\/+$/, "");
        const fetchAssetBytes = makeAssetFetcher(apiUrl);

        const result = await materializeWorkflowConstantAssets(graph, {
          packageName: opts.package,
          assetsRoot,
          fetchAssetBytes,
          ...(opts.includeRemote ? { includeRemote: true } : {})
        });

        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const example = {
          id: slug || "workflow",
          access: "public",
          name,
          description,
          tags,
          package_name: opts.package,
          graph: result.graph
        };

        // Sanitize the on-disk filename separately from the display name so
        // names with path separators can't escape the examples directory.
        const safeFileName =
          name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "") ||
          "workflow";
        const outPath =
          opts.output ?? join(examplesDir, opts.package, `${safeFileName}.json`);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, JSON.stringify(example, null, 2) + "\n", "utf8");

        for (const a of result.exported) {
          console.error(
            `  asset ${a.source} → ${a.packageUri} (${a.byteLength} bytes)`
          );
        }
        for (const s of result.skipped) {
          console.error(`  warning: could not resolve asset ${s} (left as-is)`);
        }
        console.log(outPath);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    }
  );

workflows
  .command("export-bundle <workflow_id_or_file...>")
  .description(
    "Export one or more workflows as a portable .nodetool bundle (zip): the " +
      "graphs plus the bytes of every asset they reference, in a single file"
  )
  .option(
    "--api-url <url>",
    "API base URL (used to fetch the workflow and asset bytes by id)",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("-o, --output <file>", "Output path (default: <name>.nodetool)")
  .option(
    "--include-remote",
    "Also embed http(s) and local-file refs (off by default)"
  )
  .action(
    async (
      idsOrFiles: string[],
      opts: { apiUrl: string; output?: string; includeRemote?: boolean }
    ) => {
      try {
        const { readFileSync } = await import("node:fs");
        const { writeFile } = await import("node:fs/promises");
        const { packWorkflowsBundle } = await import("@nodetool-ai/websocket");

        type BundleWf = {
          name: string;
          description?: string;
          tags?: string[];
          run_mode?: string | null;
          settings?: Record<string, unknown> | null;
          graph: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
        };

        const toBundleWf = (raw: Record<string, unknown>): BundleWf => ({
          name: typeof raw.name === "string" ? raw.name : "workflow",
          description: typeof raw.description === "string" ? raw.description : "",
          tags: Array.isArray(raw.tags)
            ? raw.tags.filter((t): t is string => typeof t === "string")
            : [],
          run_mode: (raw.run_mode as string | null | undefined) ?? null,
          settings: (raw.settings as Record<string, unknown> | null) ?? null,
          graph: (raw.graph ?? raw) as BundleWf["graph"]
        });

        const apiUrl = opts.apiUrl.replace(/\/+$/, "");
        const workflowsToPack: BundleWf[] = [];
        for (const idOrFile of idsOrFiles) {
          const isFile =
            idOrFile.endsWith(".json") ||
            idOrFile.includes("/") ||
            idOrFile.includes("\\");
          const raw = isFile
            ? (JSON.parse(readFileSync(idOrFile, "utf8")) as Record<string, unknown>)
            : ((await createApiClient(apiUrl).workflows.get.query({
                id: idOrFile
              })) as Record<string, unknown>);
          const wf = toBundleWf(raw);
          if (!wf.graph?.nodes) {
            throw new Error(`Workflow '${idOrFile}' has no graph to export`);
          }
          workflowsToPack.push(wf);
        }

        const { bytes, manifest, skipped } = await packWorkflowsBundle({
          workflows: workflowsToPack,
          fetchAssetBytes: makeAssetFetcher(apiUrl),
          nodetoolVersion: cliVersion(),
          ...(opts.includeRemote ? { includeRemote: true } : {})
        });

        const defaultBase =
          workflowsToPack.length === 1
            ? workflowsToPack[0]!.name.replace(/[^A-Za-z0-9._-]+/g, "_")
            : `${workflowsToPack.length}-workflows`;
        const outPath = opts.output ?? `${defaultBase}.nodetool`;
        await writeFile(outPath, bytes);

        for (const a of manifest.assets) {
          console.error(`  embedded ${a.file} (${a.bytes} bytes)`);
        }
        for (const s of skipped) {
          console.error(`  warning: could not resolve asset ${s} (left as-is)`);
        }
        console.error(
          `  bundled ${manifest.workflows.length} workflow(s), ${manifest.assets.length} asset(s)`
        );
        console.log(outPath);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    }
  );

workflows
  .command("import-bundle <bundle_file>")
  .description(
    "Import a .nodetool bundle into the local library: store its assets and " +
      "create the workflows with refs rewritten to the imported assets"
  )
  .option("--json", "Output the created workflows as JSON")
  .action(async (bundleFile: string, opts: { json?: boolean }) => {
    try {
      const { readFileSync } = await import("node:fs");
      const { randomUUID } = await import("node:crypto");
      const { extname } = await import("node:path");
      const { importWorkflowBundle } = await import("@nodetool-ai/websocket");

      await setupDb();
      const storage = new FileStorageAdapter(getDefaultAssetsPath());

      const zip = new Uint8Array(readFileSync(bundleFile));
      const result = await importWorkflowBundle(zip, {
        storeAsset: async ({ bytes, fileName, contentType }) => {
          const id = randomUUID();
          const key = `${id}${extname(fileName)}`;
          await storage.store(key, bytes, contentType);
          return { uri: `asset://${key}`, assetId: id };
        }
      });

      const created: Record<string, unknown>[] = [];
      for (const wf of result.workflows) {
        created.push(
          (await Workflow.create({
            user_id: "1",
            name: wf.name,
            description: wf.description ?? "",
            tags: wf.tags ?? [],
            access: "private",
            graph: wf.graph,
            run_mode: wf.run_mode ?? "workflow",
            settings: wf.settings ?? null
          })) as unknown as Record<string, unknown>
        );
      }

      for (const s of result.missing) {
        console.error(`  warning: bundle asset ${s} was missing from the archive`);
      }
      for (const m of result.checksumMismatches) {
        console.error(`  warning: ${m}`);
      }
      console.error(
        `  imported ${created.length} workflow(s) and ${result.imported.length} asset(s) into local storage`
      );

      if (opts.json) {
        asJson(created);
      } else {
        for (const c of created) {
          console.log(String(c["id"]));
        }
      }
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

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
      const client = createApiClient(opts.apiUrl);
      const data = await client.jobs.list.query({
        limit: Number.parseInt(opts.limit, 10),
        ...(opts.workflowId ? { workflow_id: opts.workflowId } : {})
      });
      const rows = data.jobs as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(
        rows.map((r) => ({
          id: r["id"],
          status: r["status"],
          workflow_id: r["workflow_id"],
          started_at: r["started_at"],
          cost: r["cost"] ?? ""
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
      const client = createApiClient(opts.apiUrl);
      const data = await client.jobs.get.query({ id: jobId });
      if (opts.json) {
        asJson(data);
        return;
      }
      const j = data as unknown as Record<string, unknown>;
      printTable([
        {
          id: j["id"],
          status: j["status"],
          workflow_id: j["workflow_id"],
          error: j["error"] ?? "",
          cost: j["cost"] ?? ""
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
      const client = createApiClient(opts.apiUrl);
      const data = await client.assets.list.query({
        page_size: Number.parseInt(opts.limit, 10),
        ...(opts.contentType ? { content_type: opts.contentType } : {})
      });
      // Note: --query isn't forwarded because assets.list has no server-side
      // search; keep local filtering until the tRPC schema exposes one.
      let rows = data.assets as Record<string, unknown>[];
      if (opts.query) {
        const q = String(opts.query).toLowerCase();
        rows = rows.filter((r) =>
          String(r["name"] ?? "").toLowerCase().includes(q)
        );
      }
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
      const client = createApiClient(opts.apiUrl);
      const data = await client.assets.get.query({ id: assetId });
      if (opts.json) {
        asJson(data);
        return;
      }
      const a = data as unknown as Record<string, unknown>;
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
// models
// ---------------------------------------------------------------------------

const models = program.command("models").description("Model management");

const modelKinds = ["llm", "image", "tts", "asr", "video", "embedding"] as const;
type ModelKind = (typeof modelKinds)[number];

const byProviderRoute: Record<ModelKind, string> = {
  llm: "llmByProvider",
  image: "imageByProvider",
  tts: "ttsByProvider",
  asr: "asrByProvider",
  video: "videoByProvider",
  embedding: "embeddingByProvider"
};

function modelRow(m: Record<string, unknown>): Record<string, unknown> {
  return {
    id: m["id"],
    name: m["name"],
    provider: m["provider"] ?? "",
    type: m["type"] ?? "",
    repo_id: m["repo_id"] ?? ""
  };
}

models
  .command("list")
  .description("List all models (recommended + provider + HF cached)")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const client = createApiClient(opts.apiUrl);
      const data = await client.models.all.query();
      const rows = data as unknown as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

models
  .command("providers")
  .description("List configured providers and their capabilities")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const client = createApiClient(opts.apiUrl);
      const data = await client.models.providers.query();
      if (opts.json) {
        asJson(data);
        return;
      }
      printTable(
        data.map((p) => ({
          provider: p.provider,
          capabilities: p.capabilities.join(", ")
        }))
      );
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

registerRecommendedCommand(models);
registerHfCommands(models);

models
  .command("ollama")
  .description("List Ollama models")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const client = createApiClient(opts.apiUrl);
      const data = await client.models.ollama.query();
      const rows = data as unknown as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows);
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

models
  .command("huggingface")
  .description("List HuggingFace cached models")
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--query <q>", "Search query")
  .option("--type <t>", "Filter by HF model type")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      const client = createApiClient(opts.apiUrl);
      const data =
        opts.query || opts.type
          ? await client.models.huggingfaceSearch.query({
              ...(opts.query ? { query: String(opts.query) } : {}),
              ...(opts.type ? { type: String(opts.type) } : {})
            })
          : await client.models.huggingfaceList.query();
      const rows = data as unknown as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

models
  .command("by-provider <provider>")
  .description(
    `List models for a provider. --kind one of: ${modelKinds.join(", ")}`
  )
  .option(
    "--api-url <url>",
    "API base URL",
    process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
  )
  .option("--kind <kind>", "Model kind", "llm")
  .option("--json", "Output as JSON")
  .action(async (provider, opts) => {
    const kind = opts.kind as ModelKind;
    if (!modelKinds.includes(kind)) {
      console.error(
        `Invalid --kind '${opts.kind}'. Must be one of: ${modelKinds.join(", ")}`
      );
      process.exit(1);
    }
    try {
      const client = createApiClient(opts.apiUrl);
      const route = byProviderRoute[kind];
      const data = await (
        client.models as unknown as Record<
          string,
          { query: (input: { provider: string }) => Promise<unknown[]> }
        >
      )[route]!.query({ provider });
      const rows = data as Record<string, unknown>[];
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
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
registerWorkerCommands(program);

// ---------------------------------------------------------------------------
// deploy — registered from commands/deploy.ts
// ---------------------------------------------------------------------------

registerDeployCommands(program);
registerAgentCommands(program);
registerDbCommands(program);
registerDebugCommands(program);

// ---------------------------------------------------------------------------

program.parse();
