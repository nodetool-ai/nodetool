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

import { initTelemetry } from "@nodetool/runtime";
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import { loadSettings } from "./settings.js";
import { runStdinMode } from "./stdin.js";
import { buildConfiguredProviders } from "./providers.js";
import { initDb, getSecret } from "@nodetool/models";
import { getDefaultDbPath, configureLogging } from "@nodetool/config";
import { NodeRegistry } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import {
  DockerSandboxProvider,
  SessionStore,
  type Sandbox
} from "@nodetool/sandbox";
import { createSandboxTools } from "@nodetool/sandbox-tools";
import { randomUUID } from "node:crypto";
import type { Tool } from "@nodetool/agents";

// Configure logging: in interactive mode, suppress non-error logs to a file
// so they don't interfere with the Ink TUI. Env vars can still override.
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

if (!process.env["NODETOOL_LOG_LEVEL"]) {
  process.env["NODETOOL_LOG_LEVEL"] = "error";
}
if (!process.env["NODETOOL_LOG_FILE"]) {
  const logDir = join(homedir(), ".nodetool");
  mkdirSync(logDir, { recursive: true });
  process.env["NODETOOL_LOG_FILE"] = join(logDir, "chat.log");
}
configureLogging();

// Initialize OpenLLMetry before any LLM SDK calls are made.
// No-op if TRACELOOP_API_KEY / OTEL_EXPORTER_OTLP_ENDPOINT is not set.
await initTelemetry();

program
  .name("nodetool-chat")
  .description(
    "NodeTool interactive chat CLI with multi-provider LLM support and agent mode"
  )
  .option(
    "-p, --provider <provider>",
    "LLM provider (anthropic, openai, ollama, gemini, mistral, groq)"
  )
  .option("-m, --model <model>", "Model ID")
  .option("-a, --agent", "Start in agent mode")
  .option("--no-agent", "Disable agent mode (overrides saved settings)")
  .option(
    "--planner <type>",
    "Agent planner: 'graph' (workflow builder, default) or 'multi' (parallel tasks)"
  )
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
    "--sandbox",
    "Provision an isolated Docker sandbox and expose its tools (file, shell, browser, desktop, search, messaging) to the agent"
  )
  .option(
    "--sandbox-image <image>",
    "Override the sandbox Docker image (default: nodetool/sandbox-agent:latest)"
  )
  .helpOption("-h, --help", "Show help")
  .version("0.1.0")
  .parse();

const opts = program.opts<{
  provider?: string;
  model?: string;
  agent?: boolean;
  planner?: string;
  workspace?: string;
  tools?: string;
  url?: string;
  sandbox?: boolean;
  sandboxImage?: string;
}>();

// Initialize database
try {
  initDb(getDefaultDbPath());
} catch {
  // DB unavailable — secret lookups will fall back to env vars
}

// Load persisted settings and merge with CLI flags
const settings = await loadSettings();

const provider = opts.provider ?? settings.provider;
const model = opts.model ?? settings.model;
// When connecting to a WS server, default to regular chat mode unless --agent is explicit
const agentMode = opts.agent ?? (opts.url ? false : settings.agentMode);
const agentPlanner: "multi" | "graph" =
  opts.planner === "multi" || opts.planner === "graph"
    ? opts.planner
    : settings.agentPlanner;
const workspace = opts.workspace ?? settings.workspace;
const enabledTools = opts.tools
  ? opts.tools.split(",").map((t) => t.trim())
  : settings.enabledTools;

// Always-on tools (no credentials needed)
for (const tool of [
  "statistics",
  "geometry",
  "conversion",
  "extract_pdf_text",
  "convert_pdf_to_markdown",
  "convert_document"
]) {
  if (!enabledTools.includes(tool)) enabledTools.push(tool);
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
  autoEnable("SERPAPI_API_KEY", [
    "google_search",
    "google_news",
    "google_images"
  ]),
  autoEnable("OPENAI_API_KEY", [
    "openai_web_search",
    "openai_image_generation",
    "openai_text_to_speech"
  ]),
  autoEnable("DATA_FOR_SEO_LOGIN", ["dataseo_search", "dataseo_news"]),
  autoEnable("IMAP_USERNAME", ["search_email", "archive_email"])
]);

// --- Sandbox provisioning (optional) ---------------------------------------
//
// When `--sandbox` is set we bring up a DockerSandbox for this CLI process,
// wrap its ToolClient with the agent adapter, and pass the resulting Tool
// array into the App as `extraTools`. The sandbox is released on exit.

let sandboxStore: SessionStore | null = null;
let sandboxHandle: Sandbox | null = null;
let sandboxExtraTools: Tool[] | undefined;

if (opts.sandbox) {
  const provider_ = new DockerSandboxProvider(
    opts.sandboxImage ? { defaultImage: opts.sandboxImage } : {}
  );
  sandboxStore = new SessionStore({ provider: provider_ });
  const sessionId = `cli-${randomUUID().slice(0, 8)}`;
  try {
    sandboxHandle = await sandboxStore.acquire(sessionId, {
      workspaceDir: workspace
    });
    sandboxExtraTools = createSandboxTools(sandboxHandle.client);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to provision sandbox: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const cleanup = async (): Promise<void> => {
    try {
      if (sandboxStore) await sandboxStore.close();
    } catch {
      // ignore
    }
  };
  process.on("SIGINT", () => void cleanup().finally(() => process.exit(130)));
  process.on("SIGTERM", () => void cleanup().finally(() => process.exit(143)));
  process.on("exit", () => {
    // Best-effort synchronous cleanup; `release` is async so we just
    // kick it off and trust Docker to reap containers on daemon shutdown.
    if (sandboxHandle) void sandboxHandle.release();
  });
}

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
      agentMode,
      agentPlanner,
      wsUrl: opts.url,
      extraTools: sandboxExtraTools,
      registry: cliRegistry,
      agentProviders: cliAgentProviders
    });
  } finally {
    if (sandboxStore) await sandboxStore.close();
  }
  process.exit(0);
}

const { waitUntilExit } = render(
  React.createElement(App, {
    initialProvider: provider,
    initialModel: model,
    initialAgentMode: agentMode,
    initialAgentPlanner: agentPlanner,
    enabledTools,
    workspaceDir: workspace,
    wsUrl: opts.url,
    extraTools: sandboxExtraTools,
    registry: cliRegistry,
    agentProviders: cliAgentProviders
  }),
  { exitOnCtrlC: false }
);

await waitUntilExit();
if (sandboxStore) await sandboxStore.close();
process.exit(0);
