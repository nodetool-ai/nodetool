/**
 * `nodetool agent` — run the agent loop over the default toolbelt, with full
 * trace output.
 *
 * Subcommands:
 *   nodetool agent run --objective "..."   # objective may also come from stdin
 *   nodetool agent diagnose <job_id>       # aggregate a failed run into a report
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import chalk from "chalk";

import {
  FileStorageAdapter,
  ProcessingContext,
  type BaseProvider
} from "@nodetool-ai/runtime";
import {
  Agent,
  getAgentToolbelt,
  getAllMcpTools,
  type Tool
} from "@nodetool-ai/agents";
import { initDb, getSecret } from "@nodetool-ai/models";
import { getDefaultDbPath, configureLogging } from "@nodetool-ai/config";
import { createProvider, buildConfiguredProviders } from "../providers.js";
import { buildFullRegistry } from "../node-registry.js";
import { mcpToolHostDeps } from "@nodetool-ai/websocket";
import {
  diagnoseRun,
  renderDiagnosis,
  type DiagnoseInputs,
  type DiagnoseJob,
  type TraceSpanLite
} from "../diagnose.js";

const PROVIDER_ALIASES: Record<string, string> = {
  google: "gemini",
  googleai: "gemini",
  "google-ai": "gemini"
};

function normalizeProvider(name: string): string {
  const lower = name.toLowerCase();
  return PROVIDER_ALIASES[lower] ?? lower;
}

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(process.env["HOME"] ?? "", p.slice(1));
  }
  return p;
}

// ---------------------------------------------------------------------------
// Toolbelt
// ---------------------------------------------------------------------------

/**
 * The default toolbelt, keyed by name. This is the same belt every
 * model-facing surface assembles: `getAgentToolbelt()` plus the platform tools
 * (workflows, nodes, jobs, assets, apps, models, media).
 *
 * The platform tools run in-process (no HTTP fallback), so this host injects
 * what they need: the full TS node registry, and the server's host deps
 * (example catalog, DSL exporter, package assets, and the lazy Python-aware
 * run environment — the bridge starts only when a run needs it).
 */
function buildToolMap(
  providers: Record<string, BaseProvider>
): Map<string, Tool> {
  const map = new Map<string, Tool>();
  for (const tool of getAgentToolbelt()) map.set(tool.name, tool);
  for (const tool of getAllMcpTools({
    providers,
    registry: buildFullRegistry(),
    ...mcpToolHostDeps()
  })) {
    map.set(tool.name, tool);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tracer — pretty-print every ProcessingMessage to stderr
// ---------------------------------------------------------------------------

interface TraceOptions {
  json: boolean;
  verbose: boolean;
}

function shorten(s: string, n = 200): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
}

function ts(): string {
  const d = new Date();
  return d.toISOString().slice(11, 23);
}

function traceEvent(msg: any, opts: TraceOptions): void {
  if (opts.json) {
    process.stderr.write(JSON.stringify(msg) + "\n");
    return;
  }
  const t = chalk.gray(ts());
  switch (msg.type) {
    case "log_update":
      process.stderr.write(
        `${t} ${chalk.cyan("log")}      ${shorten(msg.content ?? "")}\n`
      );
      break;
    case "planning_update":
      process.stderr.write(
        `${t} ${chalk.magenta("plan")}     [${msg.phase}/${msg.status}] ${shorten(msg.content ?? "")}\n`
      );
      break;
    case "task_update":
      process.stderr.write(
        `${t} ${chalk.blue("task")}     ${msg.event}${msg.task?.title ? ` — ${shorten(msg.task.title, 80)}` : ""}${msg.step?.id ? ` (step ${msg.step.id.slice(0, 8)})` : ""}\n`
      );
      break;
    case "tool_call_update": {
      const args =
        msg.args && Object.keys(msg.args).length
          ? shorten(JSON.stringify(msg.args), 160)
          : "";
      process.stderr.write(
        `${t} ${chalk.yellow("tool→")}    ${msg.name}${args ? `(${args})` : "()"}\n`
      );
      break;
    }
    case "tool_result_update": {
      const preview = shorten(JSON.stringify(msg.result ?? {}), 160);
      process.stderr.write(`${t} ${chalk.yellow("tool←")}    ${preview}\n`);
      break;
    }
    case "step_result": {
      const tag = msg.is_task_result
        ? chalk.green("result★")
        : chalk.green("step✓ ");
      const preview =
        typeof msg.result === "string"
          ? shorten(msg.result, 200)
          : shorten(JSON.stringify(msg.result ?? null), 200);
      process.stderr.write(`${t} ${tag}  ${preview}\n`);
      if (msg.error)
        process.stderr.write(`${t} ${chalk.red("error")}    ${msg.error}\n`);
      break;
    }
    case "chunk":
      if (opts.verbose && msg.content) {
        process.stderr.write(
          `${t} ${chalk.gray("chunk")}    ${shorten(msg.content, 80)}\n`
        );
      }
      break;
    case "error":
      process.stderr.write(`${t} ${chalk.red("error")}    ${msg.message}\n`);
      break;
    default:
      if (opts.verbose) {
        process.stderr.write(`${t} ${chalk.gray(msg.type)}\n`);
      }
  }
}

// ---------------------------------------------------------------------------
// run subcommand
// ---------------------------------------------------------------------------

async function readObjectiveFromStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  return text || null;
}

interface RunOptions {
  objective?: string;
  provider?: string;
  model?: string;
  workspace?: string;
  maxIterations?: string;
  maxSteps?: string;
  json?: boolean;
  verbose?: boolean;
}

async function runAgentCommand(opts: RunOptions): Promise<void> {
  // Quiet the runtime's INFO logger so it doesn't interleave the trace.
  // Users who want raw logs can set NODETOOL_LOG_LEVEL=info before running.
  if (!process.env["NODETOOL_LOG_LEVEL"]) {
    process.env["NODETOOL_LOG_LEVEL"] = "error";
  }
  configureLogging();

  // DB for secrets
  try {
    initDb(getDefaultDbPath());
  } catch {
    /* fallback to env vars */
  }

  if (!opts.provider) {
    throw new Error("No provider specified. Use --provider <id>.");
  }
  const providerId = normalizeProvider(opts.provider);
  const modelId = opts.model;
  if (!modelId) {
    throw new Error("No model specified. Use --model <id>.");
  }

  const objective = opts.objective ?? (await readObjectiveFromStdin());
  if (!objective) {
    throw new Error(
      'No objective provided. Use --objective "..." or pipe it via stdin.'
    );
  }

  // Configured providers (for find_model + media tool dispatch)
  const configuredProviders = await buildConfiguredProviders();

  // One belt, every run. A narrowing flag made each invocation its own
  // configuration — the thing YAML configs were removed for — and an agent
  // run that behaves differently from the last one is not reproducible.
  const tools = [...buildToolMap(configuredProviders).values()];

  const workspaceDir = expandTilde(opts.workspace ?? process.cwd());
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
  } catch {
    /* ignore — an existing dir is the common case */
  }

  const provider = await createProvider(providerId);

  if (!opts.json) {
    process.stderr.write(
      chalk.bold(`\n▸ agent\n`) +
        chalk.gray(
          `  provider=${providerId} model=${modelId} tools=${tools.length}\n`
        ) +
        chalk.gray(`  objective: ${shorten(objective, 200)}\n\n`)
    );
  }

  const agentOptions: ConstructorParameters<typeof Agent>[0] = {
    name: "cli-agent",
    objective,
    provider,
    model: modelId,
    tools
  };
  if (opts.maxIterations !== undefined) {
    agentOptions.maxStepIterations = Number(opts.maxIterations);
  }
  if (opts.maxSteps !== undefined) {
    agentOptions.maxSteps = Number(opts.maxSteps);
  }
  const agent = new Agent(agentOptions);

  const ctx = new ProcessingContext({
    jobId: `agent-${Date.now()}`,
    userId: "1",
    workspaceDir,
    workspaceStorage: new FileStorageAdapter(workspaceDir),
    secretResolver: getSecret
  });
  for (const [id, p] of Object.entries(configuredProviders)) {
    ctx.registerProvider(id, p);
  }

  const traceOpts: TraceOptions = {
    json: !!opts.json,
    verbose: !!opts.verbose
  };

  let finalText: string | null = null;
  let errored = false;

  try {
    for await (const msg of agent.execute(ctx)) {
      traceEvent(msg, traceOpts);
      if (msg.type === "step_result") {
        const sr = msg;
        if (sr.is_task_result) {
          finalText =
            typeof sr.result === "string"
              ? sr.result
              : JSON.stringify(sr.result, null, 2);
        }
      } else if (msg.type === "error") {
        errored = true;
      }
    }
  } catch (e) {
    errored = true;
    process.stderr.write(chalk.red(`\nagent failed: ${String(e)}\n`));
  }

  if (finalText === null) {
    const r = agent.getResults();
    if (r != null) {
      finalText = typeof r === "string" ? r : JSON.stringify(r, null, 2);
    }
  }

  if (!opts.json) process.stderr.write(chalk.bold("\n— result —\n"));
  if (finalText) process.stdout.write(finalText + "\n");

  process.exit(errored ? 1 : 0);
}

// ---------------------------------------------------------------------------
// diagnose subcommand — aggregate a failed run into one report
// ---------------------------------------------------------------------------

interface DiagnoseOptions {
  json?: boolean;
  traceFile?: string;
  apiUrl?: string;
}

/** Parse a JSONL file into one parsed object per non-blank line. */
async function readJsonl<Line extends object = Record<string, unknown>>(
  file: string
): Promise<Line[]> {
  const text = await fsp.readFile(file, "utf-8");
  const out: Line[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      // SAFETY: each caller names the record shape its own bundle file was
      // written with — this reader only splits lines and parses JSON.
      out.push(JSON.parse(trimmed) as Line);
    } catch {
      // Skip partial/corrupt lines (e.g. a crash mid-write).
    }
  }
  return out;
}

/** First existing path among the candidates, or null. */
function firstExisting(candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      // Not a readable file — try the next candidate.
    }
  }
  return null;
}

/**
 * Locate a debug bundle directory for a job id. The `debug` command writes
 * bundles to `nodetool-debug/<id>-<timestamp>/`; we pick the most recent dir
 * whose name starts with the id, relative to cwd.
 */
function findDebugBundle(jobId: string): string | null {
  const root = path.join(process.cwd(), "nodetool-debug");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(`${jobId}-`))
    .map((e) => path.join(root, e.name))
    .sort();
  return matches.length > 0 ? matches[matches.length - 1]! : null;
}

/** Fetch a job record over the tRPC API; null when unreachable/not found. */
async function fetchJob(
  apiUrl: string,
  jobId: string
): Promise<DiagnoseJob | null> {
  try {
    const { createTRPCClient, httpBatchLink } = await import("@trpc/client");
    type Router = import("@nodetool-ai/websocket/trpc").AppRouter;
    const client = createTRPCClient<Router>({
      // methodOverride POST keeps batched input in the body, not the URL, so
      // large batches stay under reverse-proxy URL-length limits. See #3979.
      links: [httpBatchLink({ url: `${apiUrl}/trpc`, methodOverride: "POST" })]
    });
    const data = await client.jobs.get.query({ id: jobId });
    return {
      id: typeof data["id"] === "string" ? data["id"] : jobId,
      status:
        typeof data["status"] === "string"
          ? data["status"]
          : undefined,
      error:
        typeof data["error"] === "string" ? data["error"] : null,
      workflowId:
        typeof data["workflow_id"] === "string"
          ? data["workflow_id"]
          : null
    };
  } catch {
    // Server unreachable or job missing — diagnose degrades on a null job.
    return null;
  }
}

async function diagnoseCommand(
  jobId: string,
  opts: DiagnoseOptions
): Promise<void> {
  const apiUrl =
    opts.apiUrl ?? process.env["NODETOOL_API_URL"] ?? "http://localhost:7777";

  const inputs: DiagnoseInputs = {};

  // Job record (best-effort over the API).
  const job = await fetchJob(apiUrl, jobId);
  if (job) inputs.job = job;
  else inputs.job = { id: jobId };

  // Messages + trace from a debug bundle (when one exists for this job).
  const bundle = findDebugBundle(jobId);
  if (bundle) {
    const messagesPath = firstExisting([
      path.join(bundle, "server", "messages.jsonl")
    ]);
    if (messagesPath) {
      try {
        inputs.messages = await readJsonl(messagesPath);
      } catch {
        // Unreadable — leave messages unset so the report flags it missing.
      }
    }
  }

  // Trace spans: --trace-file > NODETOOL_TRACE_FILE > the bundle's trace.jsonl.
  const tracePath = firstExisting(
    [
      opts.traceFile,
      process.env["NODETOOL_TRACE_FILE"],
      bundle ? path.join(bundle, "server", "trace.jsonl") : undefined
    ].filter((p): p is string => p != null)
  );
  if (tracePath) {
    try {
      inputs.spans = await readJsonl<TraceSpanLite>(tracePath);
    } catch {
      // Unreadable — report flags trace as missing.
    }
  }

  const report = diagnoseRun(inputs);

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(renderDiagnosis(report) + "\n");
  }
  process.exit(report.ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerAgentCommands(program: Command): void {
  const agent = program
    .command("agent")
    .description("Run the agent loop from the command line");

  agent
    .command("run")
    .description(
      "Run an agent over the default toolbelt (objective via --objective or stdin)"
    )
    .option("-o, --objective <text>", "Objective for the agent")
    .option("-p, --provider <id>", "Provider id")
    .option("-m, --model <id>", "Model id")
    .option("-w, --workspace <path>", "Workspace dir (default: cwd)")
    // The default of 15 is too low for a step that must discover nodes, build
    // a graph and validate it — and `claude_agent_sdk` THROWS on the cap
    // instead of stopping, so the step fails and blocks everything after it.
    .option(
      "--max-iterations <n>",
      "Action rounds per step (default 15; raise for claude_agent_sdk)"
    )
    .option("--max-steps <n>", "Steps allowed in the run (default 50)")
    .option("--json", "Emit each event as a JSON line on stderr")
    .option("-v, --verbose", "Include chunk/other low-level events in trace")
    .action(async (opts: RunOptions) => {
      try {
        await runAgentCommand(opts);
      } catch (e) {
        process.stderr.write(chalk.red(`error: ${String(e)}\n`));
        process.exit(1);
      }
    });

  agent
    .command("diagnose <job_id>")
    .description(
      "Aggregate a failed run (failing node/step, error, last LLM call, memory) into one report"
    )
    .option("--json", "Emit the DiagnosisReport as JSON")
    .option(
      "--trace-file <path>",
      "Trace JSONL to read the last llm.chat span from (else NODETOOL_TRACE_FILE or the debug bundle)"
    )
    .option("--api-url <url>", "API base URL for the job lookup")
    .action(async (jobId: string, opts: DiagnoseOptions) => {
      try {
        await diagnoseCommand(jobId, opts);
      } catch (e) {
        process.stderr.write(chalk.red(`error: ${String(e)}\n`));
        process.exit(1);
      }
    });
}
