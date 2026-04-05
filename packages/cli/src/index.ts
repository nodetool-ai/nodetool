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
import { initDb } from "@nodetool/models";
import { getSecret } from "@nodetool/security";
import { getDefaultDbPath } from "@nodetool/config";

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
    "-w, --workspace <path>",
    "Workspace directory (default: current directory)"
  )
  .option("--tools <tools>", "Comma-separated list of enabled tools")
  .option(
    "-u, --url <url>",
    "NodeTool server WebSocket URL (e.g. ws://localhost:7777/ws)"
  )
  .helpOption("-h, --help", "Show help")
  .version("0.1.0")
  .parse();

const opts = program.opts<{
  provider?: string;
  model?: string;
  agent?: boolean;
  workspace?: string;
  tools?: string;
  url?: string;
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

// Stdin mode: activated when stdin is piped (not a TTY)
if (!process.stdin.isTTY) {
  await runStdinMode({
    provider,
    model,
    workspaceDir: workspace,
    agentMode,
    wsUrl: opts.url
  });
  process.exit(0);
}

const { waitUntilExit } = render(
  React.createElement(App, {
    initialProvider: provider,
    initialModel: model,
    initialAgentMode: agentMode,
    enabledTools,
    workspaceDir: workspace,
    wsUrl: opts.url
  }),
  { exitOnCtrlC: false }
);

await waitUntilExit();
process.exit(0);
