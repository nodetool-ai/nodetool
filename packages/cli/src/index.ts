#!/usr/bin/env node
/**
 * nodetool-chat — Entry point.
 *
 * Usage:
 *   nodetool-chat                           # use saved/auto-detected settings
 *   nodetool-chat --provider anthropic      # override provider
 *   nodetool-chat --model claude-opus-4-6   # override model
 *   nodetool-chat --agent                   # start in agent mode
 *   nodetool-chat --workspace /path/to/dir  # set workspace directory
 */

import { initTelemetry, shutdownTelemetry } from "@nodetool-ai/runtime";
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import { ALWAYS_ENABLED_TOOLS, loadSettings } from "./settings.js";
import { installLocalModelInterfaces } from "./local-model-interfaces.js";
import { runStdinMode } from "./stdin.js";
import {
  parsePermissionMode,
  PERMISSION_MODE_NAMES
} from "./permission-gate.js";
import type { PermissionMode } from "@nodetool-ai/agents";
import { buildConfiguredProviders, KNOWN_PROVIDERS } from "./providers.js";
import { initDb, getSecret } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { getDefaultDbPath, configureLogging } from "@nodetool-ai/config";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";

// Configure logging: in interactive mode, suppress non-error logs to a file
// so they don't interfere with the Ink TUI. Env vars can still override.
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { isString } from "./predicates.js";

if (!process.env["NODETOOL_LOG_LEVEL"]) {
  process.env["NODETOOL_LOG_LEVEL"] = "error";
}
if (!process.env["NODETOOL_LOG_FILE"]) {
  const logDir = join(homedir(), ".nodetool");
  mkdirSync(logDir, { recursive: true });
  process.env["NODETOOL_LOG_FILE"] = join(logDir, "chat.log");
}
configureLogging();

program
  .name("nodetool-chat")
  .description(
    "NodeTool interactive chat CLI with multi-provider LLM support and agent mode"
  )
  .option(
    "-p, --provider <provider>",
    `LLM provider (${KNOWN_PROVIDERS.join(", ")})`
  )
  .option("-m, --model <model>", "Model ID")
  .option(
    "-a, --agent [mode]",
    "[deprecated] No-op — every chat session runs the unified loop"
  )
  .option("--no-agent", "[deprecated] No-op")
  .option(
    "-w, --workspace <path>",
    "Workspace directory (default: current directory)"
  )
  .option("--tools <tools>", "Comma-separated list of enabled tools")
  .option(
    "-u, --url <url>",
    "NodeTool server WebSocket URL (e.g. ws://localhost:7777/ws)"
  )
  .option(
    "--no-read-only-search",
    "Disable the read-only run_search fan-out primitive (on by default)"
  )
  .option(
    "--permission-mode <mode>",
    `Permission mode for piped input (${PERMISSION_MODE_NAMES.join(" | ")}); ` +
      "unset runs auto, since stdin carries the messages and not a user"
  )
  .option(
    "--trace-file <path>",
    "Append every LLM/agent/workflow span as JSONL to <path> (analyzer-friendly)"
  )
  .option(
    "--trace-stdout [format]",
    "Stream spans to stdout: 'pretty' (default, human-readable) or 'json' (JSONL)"
  )
  .option(
    "--no-trace-stdout",
    "Disable stdout span output (overrides NODETOOL_TRACE_STDOUT)"
  )
  .helpOption("-h, --help", "Show help")
  .version("0.1.0")
  .parse();

const opts = program.opts<{
  provider?: string;
  model?: string;
  agent?: boolean | string;
  workspace?: string;
  tools?: string;
  url?: string;
  readOnlySearch?: boolean;
  permissionMode?: string;
  traceFile?: string;
  traceStdout?: string | boolean;
}>();

// Refused before anything starts: a mode nobody recognizes must not fall back
// to a default the user did not ask for.
let permissionMode: PermissionMode | undefined;
try {
  permissionMode = parsePermissionMode(opts.permissionMode);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

// Initialize OpenLLMetry before any LLM SDK calls are made. Honors CLI flags
// and env vars (TRACELOOP_API_KEY, OTEL_EXPORTER_OTLP_ENDPOINT,
// NODETOOL_TRACE_FILE, NODETOOL_TRACE_STDOUT). No-op if nothing is configured.
await initTelemetry({
  ...(opts.traceFile && { traceFile: opts.traceFile }),
  ...(opts.traceStdout !== undefined && {
    stdout: parseTraceStdout(opts.traceStdout)
  })
});

function parseTraceStdout(v: string | boolean): "pretty" | "json" | false {
  if (v === false) return false;
  if (v === true) return "pretty";
  if (isString(v)) {
    const lower = v.toLowerCase();
    if (lower === "false" || lower === "0" || lower === "no") return false;
    if (lower === "json") return "json";
    if (lower === "pretty" || lower === "true" || lower === "1") return "pretty";
  }
  throw new Error(
    `--trace-stdout must be 'pretty' or 'json' (got ${JSON.stringify(v)})`
  );
}

try {
  initDb(getDefaultDbPath());
} catch {
  // DB unavailable — secret lookups will fall back to env vars
}

// Resolve the master encryption key NOW (before Ink takes over the terminal)
// so any first-time keychain prompt is visible to the user, and so that the
// first secret lookup during a chat message doesn't race against keychain
// initialization. Failures are surfaced clearly to stderr — silently falling
// back to env-only would mask DB-stored secrets and produce confusing
// "API_KEY is not configured" errors deep in provider construction.
try {
  await initMasterKey();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `[chat-cli] Could not unlock the secret store: ${msg}\n` +
      `[chat-cli] Falling back to environment variables for API keys.\n` +
      `[chat-cli] Tip: set SECRETS_MASTER_KEY or grant keychain access to enable DB-stored secrets.\n`
  );
}

// The same persistence a local workflow run gets, for every context this
// process builds (chat turns build their own on top; a sub-agent's does not).
await installLocalModelInterfaces();

// Load persisted settings and merge with CLI flags
const settings = await loadSettings();

const provider = opts.provider ?? settings.provider;
const model = opts.model ?? settings.model;

// `--agent` and the persisted `agentMode` setting are deprecated no-ops —
// every chat session now runs the unified LLM-with-tools loop, and the
// agent decides for itself whether to decompose via `run_subtask`. The flag
// is still accepted for backwards compatibility; a warning is emitted when
// it is used.
if (opts.agent !== undefined) {
  // eslint-disable-next-line no-console
  console.error(
    "Warning: --agent is deprecated and has no effect — the unified chat agent always runs."
  );
}

const workspace = opts.workspace ?? process.cwd();
const explicitTools = opts.tools
  ? opts.tools.split(",").map((t) => t.trim())
  : null;
const enabledTools = explicitTools ?? settings.enabledTools;

// Tools that gate on no credential — documents, discovery, generation — added
// to a settings file written before they existed. `--tools` is left exactly as
// typed: a caller who names a belt means that belt.
if (!explicitTools) {
  for (const tool of ALWAYS_ENABLED_TOOLS) {
    if (!enabledTools.includes(tool)) enabledTools.push(tool);
  }
}

// Auto-enable based on available secrets (env or encrypted DB)
async function autoEnable(key: string, tools: string[]): Promise<void> {
  const val = process.env[key] ?? (await getSecret(key, "1"));
  if (val) {
    for (const tool of tools) {
      if (!enabledTools.includes(tool)) enabledTools.push(tool);
    }
  }
}

await Promise.all([
  autoEnable("SERPAPI_API_KEY", ["google_search", "web_search"]),
  // `generate_image` / `generate_speech` are not here: they route by the model
  // they are given, so an OpenAI key is not what makes them usable.
  autoEnable("OPENAI_API_KEY", ["web_search"]),
  autoEnable("DATA_FOR_SEO_LOGIN", ["web_search"]),
  autoEnable("IMAP_USERNAME", ["search_email", "archive_email"])
]);

// Build a NodeRegistry once per session for the graph-native agent. Only
// when running locally (no --url): the WebSocket server has its own
// registry and doesn't need the CLI to provide one.
let cliRegistry: NodeRegistry | undefined;
if (!opts.url) {
  cliRegistry = new NodeRegistry();
  registerBaseNodes(cliRegistry);
}

// Build configured providers unconditionally so `find_model` and the
// media-generation tools (generate_image, generate_speech, etc.) are
// available to ANY agent loop — multi-task or graph — even without a
// registry.
const cliAgentProviders = await buildConfiguredProviders();

// Stdin mode: activated when stdin is piped (not a TTY)
if (!process.stdin.isTTY) {
  try {
    await runStdinMode({
      provider,
      model,
      workspaceDir: workspace,
      wsUrl: opts.url,
      registry: cliRegistry,
      agentProviders: cliAgentProviders,
      enableReadOnlySearch: opts.readOnlySearch !== false,
      ...(permissionMode !== undefined && { permissionMode })
    });
  } finally {
    await shutdownTelemetry();
  }
  process.exit(0);
}

// The Ink session builds its own belt and runs no permission gate, so a mode
// asked for here would be accepted and then ignored. Say so instead.
if (permissionMode !== undefined) {
  process.stderr.write(
    "--permission-mode applies to piped input and `nodetool agent run`; " +
      "the interactive session does not gate its belt.\n"
  );
}

const { waitUntilExit } = render(
  React.createElement(App, {
    initialProvider: provider,
    initialModel: model,
    enabledTools,
    workspaceDir: workspace,
    wsUrl: opts.url,
    registry: cliRegistry,
    agentProviders: cliAgentProviders
  }),
  { exitOnCtrlC: false }
);

await waitUntilExit();
await shutdownTelemetry();
process.exit(0);
