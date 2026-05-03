/**
 * `nodetool agent` — load YAML agent configs and run them with full trace output.
 *
 * Subcommands:
 *   nodetool agent run <yaml-file> [--objective "..."] [--mode loop|plan|multi-agent]
 *   nodetool agent test <yaml-file>     # validate config + dry list of tools/provider
 *   nodetool agent list <dir>           # list YAML configs in a directory
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import * as yaml from "js-yaml";
import chalk from "chalk";

import { ProcessingContext, type BaseProvider } from "@nodetool-ai/runtime";
import {
  MultiModeAgent,
  FindModelTool,
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool,
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  EditFileTool,
  GlobTool,
  GrepTool,
  DownloadFileTool,
  HttpRequestTool,
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
  BrowserTool,
  ScreenshotTool,
  RunCodeTool,
  CalculatorTool,
  ExtractPDFTextTool,
  ConvertPDFToMarkdownTool,
  ConvertDocumentTool,
  StatisticsTool,
  GeometryTool,
  ConversionTool,
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  DataForSEOSearchTool,
  DataForSEONewsTool,
  SearchEmailTool,
  ArchiveEmailTool,
  getAllMcpTools,
  type Tool,
  type AgentMode
} from "@nodetool-ai/agents";
import { initDb, getSecret } from "@nodetool-ai/models";
import { getDefaultDbPath, configureLogging } from "@nodetool-ai/config";
import { createProvider, buildConfiguredProviders } from "../providers.js";

// ---------------------------------------------------------------------------
// YAML schema (loose — we accept what the existing example files use)
// ---------------------------------------------------------------------------

interface ModelBlock {
  provider?: string;
  id?: string;
  name?: string;
}

interface AgentYaml {
  name?: string;
  description?: string;
  system_prompt?: string;
  objective?: string; // optional default
  model?: ModelBlock;
  planning_agent?: { enabled?: boolean; model?: ModelBlock };
  tools?: string[];
  mode?: AgentMode;
  max_tokens?: number;
  max_iterations?: number;
  max_steps?: number;
  temperature?: number;
  workspace?: { path?: string; auto_create?: boolean };
  /**
   * Provider ids to prefer when find_model ranks results. The first entry
   * becomes the default `provider_hint` if the LLM omits one.
   */
  preferred_providers?: string[];
  /**
   * Map of capability -> preferred model id(s). Auto-injected as
   * `model_hint` into find_model calls when capability matches.
   */
  preferred_models?: Record<string, string | string[]>;
}

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
// Tool resolution
// ---------------------------------------------------------------------------

interface AgentPreferences {
  preferredProviders?: string[];
  preferredModels?: Record<string, string[]>;
}

/**
 * FindModelTool that injects YAML-declared preferences as defaults when the
 * LLM omits explicit hints.
 */
class PreferringFindModelTool extends FindModelTool {
  constructor(
    providers: Record<string, BaseProvider>,
    private readonly prefs: AgentPreferences
  ) {
    super(providers);
  }

  override async process(
    context: import("@nodetool-ai/runtime").ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const merged: Record<string, unknown> = { ...params };
    const capability =
      typeof params["capability"] === "string"
        ? (params["capability"] as string)
        : undefined;

    if (
      typeof merged["provider_hint"] !== "string" &&
      this.prefs.preferredProviders &&
      this.prefs.preferredProviders.length > 0
    ) {
      merged["provider_hint"] = this.prefs.preferredProviders[0];
    }

    if (capability && !merged["model_hint"]) {
      const pref = this.prefs.preferredModels?.[capability];
      if (pref && pref.length > 0) {
        merged["model_hint"] = pref;
      }
    }
    return super.process(context, merged);
  }
}

function buildToolMap(
  providers?: Record<string, BaseProvider>,
  prefs: AgentPreferences = {}
): Record<string, Tool> {
  const m: Record<string, Tool> = {
    find_model: new PreferringFindModelTool(providers ?? {}, prefs),
    generate_image: new GenerateImageTool(),
    edit_image: new EditImageTool(),
    generate_video: new GenerateVideoTool(),
    animate_image: new AnimateImageTool(),
    generate_speech: new GenerateSpeechTool(),
    transcribe_audio: new TranscribeAudioTool(),
    embed_text: new EmbedTextTool(),
    read_file: new ReadFileTool(),
    write_file: new WriteFileTool(),
    edit_file: new EditFileTool(),
    list_directory: new ListDirectoryTool(),
    glob: new GlobTool(),
    grep: new GrepTool(),
    download_file: new DownloadFileTool(),
    http_request: new HttpRequestTool(),
    google_search: new GoogleSearchTool(),
    google_news: new GoogleNewsTool(),
    google_images: new GoogleImagesTool(),
    browser: new BrowserTool(),
    screenshot: new ScreenshotTool(),
    run_code: new RunCodeTool(),
    calculator: new CalculatorTool(),
    statistics: new StatisticsTool(),
    geometry: new GeometryTool(),
    conversion: new ConversionTool(),
    extract_pdf_text: new ExtractPDFTextTool(),
    convert_pdf_to_markdown: new ConvertPDFToMarkdownTool(),
    convert_document: new ConvertDocumentTool(),
    openai_web_search: new OpenAIWebSearchTool(),
    openai_image_generation: new OpenAIImageGenerationTool(),
    openai_text_to_speech: new OpenAITextToSpeechTool(),
    dataseo_search: new DataForSEOSearchTool(),
    dataseo_news: new DataForSEONewsTool(),
    search_email: new SearchEmailTool(),
    archive_email: new ArchiveEmailTool()
  };
  for (const tool of getAllMcpTools({ providers })) {
    m[tool.name] = tool;
  }
  return m;
}

interface ResolvedTools {
  tools: Tool[];
  unknown: string[];
}

function resolveTools(
  names: string[] | undefined,
  providers?: Record<string, BaseProvider>,
  prefs: AgentPreferences = {}
): ResolvedTools {
  if (!names || names.length === 0) return { tools: [], unknown: [] };
  const map = buildToolMap(providers, prefs);
  const tools: Tool[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const tool = map[name];
    if (tool) tools.push(tool);
    else unknown.push(name);
  }
  return { tools, unknown };
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
      process.stderr.write(
        `${t} ${chalk.yellow("tool←")}    ${preview}\n`
      );
      break;
    }
    case "step_result": {
      const tag = msg.is_task_result ? chalk.green("result★") : chalk.green("step✓ ");
      const preview =
        typeof msg.result === "string"
          ? shorten(msg.result, 200)
          : shorten(JSON.stringify(msg.result ?? null), 200);
      process.stderr.write(`${t} ${tag}  ${preview}\n`);
      if (msg.error) process.stderr.write(`${t} ${chalk.red("error")}    ${msg.error}\n`);
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
// Loaders
// ---------------------------------------------------------------------------

async function loadAgentYaml(file: string): Promise<AgentYaml> {
  const raw = await fsp.readFile(file, "utf-8");
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`YAML did not parse to an object: ${file}`);
  }
  return parsed as AgentYaml;
}

async function readObjectiveFromStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  return text || null;
}

// ---------------------------------------------------------------------------
// run subcommand
// ---------------------------------------------------------------------------

interface RunOptions {
  objective?: string;
  mode?: string;
  json?: boolean;
  verbose?: boolean;
  workspace?: string;
  provider?: string;
  model?: string;
}

async function runAgentCommand(file: string, opts: RunOptions): Promise<void> {
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

  const cfg = await loadAgentYaml(file);

  // Resolve provider/model (CLI flags override YAML)
  const providerId = opts.provider ?? normalizeProvider(cfg.model?.provider ?? "");
  if (!providerId) {
    throw new Error(
      "No provider specified. Set `model.provider` in YAML or use --provider."
    );
  }
  const modelId = opts.model ?? cfg.model?.id;
  if (!modelId) {
    throw new Error("No model specified. Set `model.id` in YAML or use --model.");
  }

  // Resolve objective: --objective > stdin > YAML default
  const stdinObjective = await readObjectiveFromStdin();
  const objective = opts.objective ?? stdinObjective ?? cfg.objective;
  if (!objective) {
    throw new Error(
      "No objective provided. Use --objective \"...\", pipe via stdin, or set `objective:` in YAML."
    );
  }

  // Configured providers (for find_model + media tool dispatch)
  const configuredProviders = await buildConfiguredProviders();

  // Preferences from YAML (preferred_providers, preferred_models)
  const prefs: AgentPreferences = {};
  if (Array.isArray(cfg.preferred_providers)) {
    prefs.preferredProviders = cfg.preferred_providers.filter(
      (x) => typeof x === "string"
    );
  }
  if (cfg.preferred_models && typeof cfg.preferred_models === "object") {
    prefs.preferredModels = {};
    for (const [cap, val] of Object.entries(cfg.preferred_models)) {
      const list = typeof val === "string" ? [val] : Array.isArray(val) ? val : [];
      const cleaned = list.filter((x) => typeof x === "string") as string[];
      if (cleaned.length > 0) prefs.preferredModels[cap] = cleaned;
    }
  }

  // Tools
  const { tools, unknown } = resolveTools(cfg.tools, configuredProviders, prefs);
  if (unknown.length > 0) {
    process.stderr.write(
      chalk.yellow(`warn: ignoring unknown tools: ${unknown.join(", ")}\n`)
    );
  }

  // Workspace
  const workspaceDir = expandTilde(
    opts.workspace ?? cfg.workspace?.path ?? process.cwd()
  );
  if (cfg.workspace?.auto_create !== false) {
    try {
      fs.mkdirSync(workspaceDir, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  // Mode
  const modeArg = (opts.mode ?? cfg.mode ?? "plan") as AgentMode;
  if (!["loop", "plan", "multi-agent"].includes(modeArg)) {
    throw new Error(`Invalid mode: ${modeArg}. Use loop|plan|multi-agent.`);
  }

  const provider = await createProvider(providerId);

  // Header
  if (!opts.json) {
    process.stderr.write(
      chalk.bold(`\n▸ ${cfg.name ?? path.basename(file)}\n`) +
        chalk.gray(
          `  provider=${providerId} model=${modelId} mode=${modeArg} tools=${tools.length}\n`
        ) +
        chalk.gray(`  objective: ${shorten(objective, 200)}\n\n`)
    );
  }

  const planningModel =
    cfg.planning_agent?.enabled === false ? modelId : cfg.planning_agent?.model?.id ?? modelId;

  // Build the effective system prompt: user prompt + a preferences block so
  // the LLM also "knows" which providers/models to favor (in addition to the
  // hint injection inside FindModelTool).
  const prefLines: string[] = [];
  if (prefs.preferredProviders && prefs.preferredProviders.length > 0) {
    prefLines.push(`Preferred providers (in order): ${prefs.preferredProviders.join(", ")}.`);
  }
  if (prefs.preferredModels) {
    for (const [cap, list] of Object.entries(prefs.preferredModels)) {
      prefLines.push(`Preferred ${cap} model: ${list.join(" or ")}.`);
    }
  }
  const effectiveSystemPrompt =
    prefLines.length > 0
      ? `${cfg.system_prompt ?? ""}\n\n# Model Preferences\n${prefLines.join("\n")}\nUse these when calling find_model unless they cannot satisfy the request.`.trim()
      : cfg.system_prompt;

  const agent = new MultiModeAgent({
    name: cfg.name ?? "yaml-agent",
    objective,
    provider,
    model: modelId,
    mode: modeArg,
    tools,
    systemPrompt: effectiveSystemPrompt,
    maxTokenLimit: cfg.max_tokens,
    maxIterations: cfg.max_iterations,
    maxSteps: cfg.max_steps,
    planningModel
  });

  const ctx = new ProcessingContext({
    jobId: `agent-${Date.now()}`,
    userId: "1",
    workspaceDir,
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
        const sr = msg as { result: unknown; is_task_result?: boolean };
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
// test subcommand — validate config without running
// ---------------------------------------------------------------------------

async function testAgentCommand(file: string): Promise<void> {
  if (!process.env["NODETOOL_LOG_LEVEL"]) {
    process.env["NODETOOL_LOG_LEVEL"] = "error";
  }
  configureLogging();
  try {
    initDb(getDefaultDbPath());
  } catch {
    /* fallback to env vars */
  }
  const cfg = await loadAgentYaml(file);
  const issues: string[] = [];
  const okLines: string[] = [];

  okLines.push(`name: ${cfg.name ?? "(unset)"}`);
  okLines.push(`description: ${cfg.description ?? "(unset)"}`);

  const provider = cfg.model?.provider;
  if (!provider) issues.push("missing model.provider");
  else okLines.push(`provider: ${provider} → ${normalizeProvider(provider)}`);

  if (!cfg.model?.id) issues.push("missing model.id");
  else okLines.push(`model: ${cfg.model.id}`);

  okLines.push(`mode: ${cfg.mode ?? "plan (default)"}`);
  okLines.push(`system_prompt: ${cfg.system_prompt ? `${cfg.system_prompt.length} chars` : "(none)"}`);

  const { tools, unknown } = resolveTools(cfg.tools);
  okLines.push(`tools resolved: ${tools.map((t) => t.name).join(", ") || "(none)"}`);
  if (unknown.length > 0) issues.push(`unknown tools: ${unknown.join(", ")}`);

  // Check provider can be instantiated
  if (provider) {
    try {
      await createProvider(normalizeProvider(provider));
      okLines.push(`provider instantiation: ok`);
    } catch (e) {
      issues.push(`provider instantiation failed: ${String(e)}`);
    }
  }

  process.stdout.write(chalk.bold(`\n▸ ${path.basename(file)}\n\n`));
  for (const line of okLines) process.stdout.write(`  ${chalk.green("✓")} ${line}\n`);
  for (const issue of issues) process.stdout.write(`  ${chalk.red("✗")} ${issue}\n`);
  process.stdout.write("\n");
  process.exit(issues.length > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// list subcommand
// ---------------------------------------------------------------------------

async function listAgentsCommand(dir: string): Promise<void> {
  const abs = path.resolve(expandTilde(dir));
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true });
  } catch (e) {
    process.stderr.write(`Cannot read ${abs}: ${String(e)}\n`);
    process.exit(1);
  }
  const yamls = entries.filter(
    (e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml"))
  );
  if (yamls.length === 0) {
    process.stdout.write(`(no YAML configs in ${abs})\n`);
    return;
  }
  for (const e of yamls) {
    const file = path.join(abs, e.name);
    try {
      const cfg = await loadAgentYaml(file);
      process.stdout.write(
        `${chalk.bold(e.name)}  ${chalk.gray(cfg.model?.provider ?? "?")}/${chalk.gray(cfg.model?.id ?? "?")}\n  ${cfg.description ?? "(no description)"}\n`
      );
    } catch (err) {
      process.stdout.write(`${e.name}  ${chalk.red("invalid: " + String(err))}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Run YAML-defined agents");

  agent
    .command("run <yaml-file>")
    .description("Run an agent from a YAML config (objective via --objective or stdin)")
    .option("-o, --objective <text>", "Objective for the agent (overrides stdin/yaml default)")
    .option("--mode <mode>", "Override mode: loop|plan|multi-agent")
    .option("-p, --provider <id>", "Override provider")
    .option("-m, --model <id>", "Override model")
    .option("-w, --workspace <path>", "Override workspace dir")
    .option("--json", "Emit each event as a JSON line on stderr")
    .option("-v, --verbose", "Include chunk/other low-level events in trace")
    .action(async (file: string, opts: RunOptions) => {
      try {
        await runAgentCommand(file, opts);
      } catch (e) {
        process.stderr.write(chalk.red(`error: ${String(e)}\n`));
        process.exit(1);
      }
    });

  agent
    .command("test <yaml-file>")
    .description("Validate an agent YAML config (provider, model, tools)")
    .action(async (file: string) => {
      try {
        await testAgentCommand(file);
      } catch (e) {
        process.stderr.write(chalk.red(`error: ${String(e)}\n`));
        process.exit(1);
      }
    });

  agent
    .command("list <dir>")
    .description("List YAML agent configs in a directory")
    .action(async (dir: string) => {
      try {
        await listAgentsCommand(dir);
      } catch (e) {
        process.stderr.write(chalk.red(`error: ${String(e)}\n`));
        process.exit(1);
      }
    });
}
