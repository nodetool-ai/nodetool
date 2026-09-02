/**
 * `nodetool agent` — run one CodeAct turn over the default toolbelt, with full
 * trace output.
 *
 * The loop is the chat's loop: the belt is assembled by `buildCliAgentBelt`
 * and the turn by `createCliCodeActTurn`, both shared with `--stdin` chat, so
 * the provider is offered `execute_code` and the toolbelt lives in the sandbox.
 * `create_plan` and `execute_plan` are on the belt, so an objective that wants
 * a plan gets one and the `planning_update` / `task_update` events stream.
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

import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import {
  getAgentToolbelt,
  getAllMcpTools,
  PERMISSION_GATE_CONTEXT_KEY,
  type Tool
} from "@nodetool-ai/agents";
import { processChat } from "@nodetool-ai/chat";
import { initDb } from "@nodetool-ai/models";
import { getDefaultDbPath, configureLogging } from "@nodetool-ai/config";
import {
  TRPC_MAX_BATCH_SIZE,
  type ProcessingMessage
} from "@nodetool-ai/protocol";
import { createProvider, buildConfiguredProviders } from "../providers.js";
import { buildFullRegistry } from "../node-registry.js";
import { mcpToolHostDeps } from "@nodetool-ai/websocket";
import {
  applySystemPrompt,
  buildCliAgentBelt,
  createCliCodeActTurn
} from "../chat-codeact.js";
import { createChatContext } from "../chat-context.js";
import {
  createCliPermissionGate,
  parsePermissionMode,
  PERMISSION_MODE_NAMES
} from "../permission-gate.js";
import {
  diagnoseRun,
  renderDiagnosis,
  type DiagnoseInputs,
  type DiagnoseJob,
  type TraceSpanLite
} from "../diagnose.js";
import { isRecord, isString } from "../predicates.js";

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

function traceEvent(msg: ProcessingMessage, opts: TraceOptions): void {
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
        isString(msg.result)
          ? shorten(msg.result, 200)
          : shorten(JSON.stringify(msg.result ?? null), 200);
      process.stderr.write(`${t} ${tag}  ${preview}\n`);
      if (msg.error)
        process.stderr.write(`${t} ${chalk.red("error")}    ${msg.error}\n`);
      break;
    }
    case "chunk":
      if (opts.verbose && isString(msg.content)) {
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

export interface RunOptions {
  objective?: string;
  provider?: string;
  model?: string;
  workspace?: string;
  maxIterations?: string;
  permissionMode?: string;
  json?: boolean;
  verbose?: boolean;
}

/** The text the run answers with: the last assistant message that carries any. */
function finalAssistantText(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (isString(message.content) && message.content.trim()) {
      return message.content;
    }
  }
  return null;
}

/** Exit code for the process: 0 when the turn finished without an error. */
export async function runAgentCommand(opts: RunOptions): Promise<number> {
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

  const workspaceDir = expandTilde(opts.workspace ?? process.cwd());
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
  } catch {
    /* ignore — an existing dir is the common case */
  }

  const provider = await createProvider(providerId);
  const context = await createChatContext({ workspaceDir });
  // Hand the context the instances already configured above, so a tool that
  // dispatches by provider id gets this run's provider rather than resolving a
  // second one of its own.
  for (const [id, configured] of Object.entries(configuredProviders)) {
    context.registerProvider(id, configured);
  }

  const traceOpts: TraceOptions = {
    json: !!opts.json,
    verbose: !!opts.verbose
  };
  const emit = (message: ProcessingMessage): void => {
    traceEvent(message, traceOpts);
  };

  // The run's gate, built once. `readObjectiveFromStdin` already returned null
  // on a TTY, so the same test says whether anyone is there to answer a
  // prompt: an objective that arrived down a pipe leaves nobody at the
  // keyboard, and the run gates headless with the notice below.
  const gate = createCliPermissionGate({
    hostName: "nodetool agent run",
    mode: parsePermissionMode(opts.permissionMode),
    interactive: process.stdin.isTTY === true,
    // In `--json` the notice and any prompt ride the event stream, so it stays
    // one JSON object per line.
    write: (text) => {
      if (opts.json) {
        emit({
          type: "log_update",
          node_id: "agent",
          node_name: "permissions",
          content: text,
          severity: "info"
        });
      } else {
        process.stderr.write(chalk.gray(`${text}\n`));
      }
    }
  });
  // Loops this command never constructs — an `AgentNode` reached through
  // `run_node`, a JS script — read the gate off the context rather than
  // building an ungated run of their own (`gateFromContext`, invariant I-1).
  context.set(PERMISSION_GATE_CONTEXT_KEY, gate);

  // One belt, every run. A narrowing flag made each invocation its own
  // configuration — the thing YAML configs were removed for — and an agent
  // run that behaves differently from the last one is not reproducible.
  const belt = buildCliAgentBelt({
    baseTools: [...buildToolMap(configuredProviders).values()],
    provider,
    model: modelId,
    forwardMessage: emit,
    gate,
    // An objective is a job, not a conversation: the two plan capabilities are
    // on the belt so the model can decompose one and run the DAG itself.
    planning: true
  });

  if (!opts.json) {
    process.stderr.write(
      chalk.bold(`\n▸ agent\n`) +
        chalk.gray(
          `  provider=${providerId} model=${modelId} tools=${belt.length}\n`
        ) +
        chalk.gray(`  objective: ${shorten(objective, 200)}\n\n`)
    );
  }

  const turn = createCliCodeActTurn({
    tools: belt,
    context,
    // Calls the sandbox makes have no provider tool-call id of their own.
    onToolCall: ({ name, args }) => {
      emit({ type: "tool_call_update", name, args });
    }
  });
  const messages: Message[] = [];
  applySystemPrompt(messages, turn.systemPrompt);

  let errored = false;
  try {
    await processChat({
      userInput: objective,
      messages,
      model: modelId,
      provider,
      context,
      tools: turn.tools,
      maxIterations:
        opts.maxIterations === undefined ? undefined : Number(opts.maxIterations),
      callbacks: {
        onChunk: (content) => {
          emit({ type: "chunk", content, done: false });
        },
        onToolCall: (call) => {
          emit({
            type: "tool_call_update",
            name: call.name,
            args: call.args,
            tool_call_id: call.id
          });
        },
        onToolResult: (call, result) => {
          emit({
            type: "tool_result_update",
            node_id: "agent",
            name: call.name,
            tool_call_id: call.id,
            result: isRecord(result) ? result : { value: result }
          });
        }
      }
    });
  } catch (e) {
    errored = true;
    const message = e instanceof Error ? e.message : String(e);
    emit({ type: "error", message });
    if (!opts.json) {
      process.stderr.write(chalk.red(`\nagent failed: ${message}\n`));
    }
  }

  const finalText = finalAssistantText(messages);

  if (!opts.json) process.stderr.write(chalk.bold("\n— result —\n"));
  if (finalText) process.stdout.write(finalText + "\n");

  // A run that ended on a tool call or a contentless assistant turn produced
  // no answer. Writing nothing and exiting 0 is indistinguishable from an
  // empty-but-successful result, so it fails instead (invariant I-3).
  if (!errored && !finalText) {
    const message =
      "agent produced no answer: the turn ended without a final assistant message";
    emit({ type: "error", message });
    if (!opts.json) {
      process.stderr.write(chalk.red(`\nagent failed: ${message}\n`));
    }
    return 1;
  }

  return errored ? 1 : 0;
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
      links: [
        httpBatchLink({
          url: `${apiUrl}/trpc`,
          maxItems: TRPC_MAX_BATCH_SIZE,
          methodOverride: "POST"
        })
      ]
    });
    const data = await client.jobs.get.query({ id: jobId });
    return {
      id: isString(data["id"]) ? data["id"] : jobId,
      status: isString(data["status"]) ? data["status"] : undefined,
      error: isString(data["error"]) ? data["error"] : null,
      workflowId: isString(data["workflow_id"]) ? data["workflow_id"] : null
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
    .option(
      "--max-iterations <n>",
      "Tool-calling rounds in the turn (default 25)"
    )
    .option(
      "--permission-mode <mode>",
      `Permission mode (${PERMISSION_MODE_NAMES.join(" | ")}); on a TTY the ` +
        "default asks before each write, execute or external call"
    )
    .option("--json", "Emit each event as a JSON line on stderr")
    .option("-v, --verbose", "Include chunk/other low-level events in trace")
    .action(async (opts: RunOptions) => {
      try {
        process.exit(await runAgentCommand(opts));
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
