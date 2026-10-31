import { printTable } from "@nodetool-ai/pack-manager/commands/output";
import { refusePackInstallsInProcess } from "@nodetool-ai/pack-manager/packs/install-process";
import { configureCliPackHost, registerPackCommands, loadInstalledCommandFeature } from "@nodetool-ai/pack-manager";
import { z } from "zod";
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { createMinimalServer, OPTIONAL_FEATURE_CATALOG } from "@nodetool-ai/server-minimal";
import { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import { OpenAITextProvider } from "@nodetool-ai/runtime-core";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { decrypt, encrypt } from "@nodetool-ai/security-core";
import { COMMAND_FEATURES } from "./commandFeatures.js";
import { featureRecovery } from "@nodetool-ai/server-features";
import { cliFailureSchema } from "./errors.js";

export interface CliOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly argv?: readonly string[];
  readonly stdout?: (value: string) => void;
  readonly fetch?: typeof fetch;
}
/** Default model for `nodetool text` when neither --model nor NODETOOL_TEXT_MODEL is set. */
export const DEFAULT_TEXT_MODEL = "gpt-4.1-mini";
/** Local single-user ID shared with the desktop app and the installed command features. */
export const DEFAULT_LOCAL_USER_ID = "1";
const QUICK_START = `
Quick start (only OPENAI_API_KEY is required; no server, no packs):
  nodetool info                                 show configured provider keys
  nodetool text "Write a haiku about rivers"    one-shot completion (default model ${DEFAULT_TEXT_MODEL})
  echo "Summarize this" | nodetool text -m gpt-4.1 --system "Be brief"
  nodetool nodes --example > flow.json          workflow using only built-in nodes
  nodetool run flow.json --params '{"topic":"rivers"}'
  nodetool packs list                           optional features (chat, agents, media nodes)

Environment: OPENAI_API_KEY, OPENAI_BASE_URL (any OpenAI-compatible endpoint),
NODETOOL_TEXT_MODEL, NODETOOL_DATA_DIR (default ./nodetool-data), NODETOOL_USER_ID
(default "${DEFAULT_LOCAL_USER_ID}"), SECRETS_MASTER_KEY (only for the encrypted secret store
and serve), NODETOOL_API_URL and NODETOOL_API_TOKEN (only for server commands).
Commands marked "Requires ... feature" need \`nodetool packs add <feature> --yes\`.
`;
/** A two-node-input workflow that runs on the built-in nodes with only OPENAI_API_KEY. */
export function exampleWorkflow(model: string): unknown {
  return {
    name: "Haiku",
    graph: {
      nodes: [
        { id: "topic", type: "nodetool.input.StringInput", properties: { name: "topic", value: "autumn" } },
        { id: "prompt", type: "nodetool.text.Template", properties: { string: "Write a haiku about {{ topic }}." } },
        { id: "llm", type: "openai.text.ChatComplete", properties: { model } },
        { id: "result", type: "nodetool.output.Output", properties: { name: "haiku" } }
      ],
      edges: [
        { source: "topic", sourceHandle: "output", target: "prompt", targetHandle: "topic" },
        { source: "prompt", sourceHandle: "output", target: "llm", targetHandle: "prompt" },
        { source: "llm", sourceHandle: "output", target: "result", targetHandle: "value" }
      ]
    }
  };
}
async function readStdin(): Promise<string> {
  let value = "";
  for await (const bytes of process.stdin) value += String(bytes);
  return value;
}
function isAuthoredSource(file: string): boolean {
  return [".ts", ".js", ".mts", ".mjs", ".cts", ".cjs"].includes(extname(file).toLowerCase());
}

/** Build the separately installable execution CLI command tree. */
export function createProgram(options: CliOptions = {}): Command {
  const env = options.env ?? process.env;
  const output = options.stdout ?? (value => process.stdout.write(value));
  const transport = options.fetch ?? fetch;
  const featureCatalog = new Map(OPTIONAL_FEATURE_CATALOG.map(feature => [feature.id, feature]));
  const print = (value: unknown): void => {
    const text = z.string().safeParse(value);
    output(`${text.success ? text.data : JSON.stringify(value, null, 2)}\n`);
  };
  const version = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))).version;
  const program = new Command("nodetool").description("NodeTool workflow runner, LLM client and execution server").version(version);
  program.configureOutput({ writeOut: output });
  program.addHelpText("after", QUICK_START);
  program.option("--api-url <url>", "Server URL", env.NODETOOL_API_URL ?? "http://127.0.0.1:7777").option("--token <token>", "Authentication token (or NODETOOL_API_TOKEN)", env.NODETOOL_API_TOKEN);
  const directory = (): string => resolve(env.NODETOOL_DATA_DIR ?? "./nodetool-data");
  const owner = (): string => env.NODETOOL_USER_ID || DEFAULT_LOCAL_USER_ID;
  const hasToken = (): boolean => Boolean(program.opts<{ token?: string }>().token);
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const flags = program.opts<{ apiUrl: string; token?: string }>();
    if (!flags.token) throw new Error("Set NODETOOL_API_TOKEN or --token");
    const url = new URL(path, `${flags.apiUrl.replace(/\/$/, "")}/`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Server URL must use HTTP(S) without credentials");
    const response = await transport(url, { ...init, headers: { authorization: `Bearer ${flags.token}`, ...init.headers }, redirect: "error" });
    if (!response.ok) {
      const text = await response.text();
      const hint = response.status === 404 ? ` (is ${flags.apiUrl} a server started with \`nodetool serve\`? Another app may own that port; set NODETOOL_API_URL or --api-url)` : "";
      const error = new Error(`Server returned ${response.status}${hint}: ${text}`);
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw error; }
      const structured = cliFailureSchema.safeParse(payload);
      if (structured.success) { Object.assign(error, structured.data); }
      throw error;
    }
    return response;
  }
  async function json(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const init: RequestInit = { method };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { "content-type": "application/json" }; }
    const response = await request(path, init);
    return response.status === 204 ? { ok: true } : response.json();
  }
  const segment = (value: string): string => encodeURIComponent(value);
  async function fileJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")); }
  function workflowGraph(document: unknown): unknown {
    const wrapper = z.record(z.string(), z.unknown()).safeParse(document);
    return wrapper.success && "graph" in wrapper.data ? wrapper.data.graph : document;
  }
  function requireMasterKey(purpose: string): string {
    const masterKey = env.SECRETS_MASTER_KEY;
    if (!masterKey || masterKey.length < 32) {
      throw new Error(`Set SECRETS_MASTER_KEY (at least 32 characters, e.g. \`export SECRETS_MASTER_KEY="$(openssl rand -base64 32)"\`) to ${purpose}. Keep it: secrets stored with one key cannot be read with another.`);
    }
    return masterKey;
  }
  async function withLocalRepository<T>(operate: (repository: ReturnType<typeof createSqliteRepository>) => Promise<T>): Promise<T> {
    await mkdir(directory(), { recursive: true });
    const repository = createSqliteRepository(join(directory(), "nodetool.db"));
    try { return await operate(repository); } finally { await repository.close(); }
  }
  /** Read a secret from the local encrypted store, when one exists and a master key is configured. */
  async function storedSecret(key: string): Promise<string | undefined> {
    const masterKey = env.SECRETS_MASTER_KEY;
    if (!masterKey || !existsSync(join(directory(), "nodetool.db"))) return undefined;
    const userId = owner();
    return withLocalRepository(async repository => {
      const secret = (await repository.list("secrets", userId)).find(row => row.key === key);
      return secret ? decrypt(masterKey, userId, z.string().parse(secret.encrypted_value)) : undefined;
    });
  }
  /** Stored tenant secret first, then the process environment. */
  async function provider(): Promise<OpenAITextProvider> {
    const apiKey = (await storedSecret("OPENAI_API_KEY")) ?? env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("No OpenAI API key: export OPENAI_API_KEY (or store it with `nodetool secrets set OPENAI_API_KEY`, which needs SECRETS_MASTER_KEY). Set OPENAI_BASE_URL to use another OpenAI-compatible endpoint.");
    }
    const configuration: { apiKey: string; baseURL?: string; fetch: typeof globalThis.fetch } = { fetch: transport, apiKey };
    if (env.OPENAI_BASE_URL) configuration.baseURL = env.OPENAI_BASE_URL;
    return new OpenAITextProvider(configuration);
  }
  /** NODETOOL_TOKENS maps tokens to users; a single NODETOOL_API_TOKEN serves NODETOOL_USER_ID. */
  function serverTokens(): Record<string, string> {
    if (env.NODETOOL_TOKENS) {
      let parsed: unknown;
      try { parsed = JSON.parse(env.NODETOOL_TOKENS); } catch { parsed = undefined; }
      const tokens = z.record(z.string().min(1), z.string().min(1)).safeParse(parsed);
      if (!tokens.success || Object.keys(tokens.data).length === 0) throw new Error("NODETOOL_TOKENS must be a JSON object mapping bearer tokens to user IDs, e.g. {\"<token>\":\"1\"}");
      return tokens.data;
    }
    if (env.NODETOOL_API_TOKEN) return { [env.NODETOOL_API_TOKEN]: owner() };
    throw new Error("Set NODETOOL_API_TOKEN (at least 32 characters, e.g. `export NODETOOL_API_TOKEN=\"$(openssl rand -hex 32)\"`) so clients can authenticate, or NODETOOL_TOKENS for several users. Local commands (text, run, nodes, secrets) do not need a server.");
  }
  function executionHost(): ReturnType<typeof createCoreExecutionHost> {
    const nodeFeatures: Record<string, string[]> = {};
    for (const feature of OPTIONAL_FEATURE_CATALOG) {
      for (const type of feature.nodeTypes ?? []) {
        const owners = nodeFeatures[type] ?? [];
        owners.push(feature.id);
        nodeFeatures[type] = owners;
      }
    }
    return createCoreExecutionHost({ nodeFeatures, provider: async () => provider() });
  }
  function validationIssues(host: ReturnType<typeof createCoreExecutionHost>, graph: unknown) {
    return host.validate(graph).map(issue => {
      if (!issue.featureIds?.length) { return issue; }
      const recovery = issue.featureIds.map(id => {
        const descriptor = featureCatalog.get(id);
        return featureRecovery(id, descriptor?.packageName, descriptor?.packId);
      });
      return { ...issue, recovery };
    });
  }
  function validationError(issues: ReturnType<typeof validationIssues>): Error {
    const featureIssues = issues.filter(issue => issue.featureIds?.length);
    return Object.assign(new Error("Workflow validation failed"), {
      code: featureIssues[0]?.code ?? "WORKFLOW_VALIDATION_FAILED",
      featureIds: [...new Set(featureIssues.flatMap(issue => issue.featureIds ?? []))],
      recovery: featureIssues.flatMap(issue => "recovery" in issue ? issue.recovery ?? [] : []),
      validation_issues: issues
    });
  }
  async function delegateAuthoredSource(file: string): Promise<boolean> {
    if (!isAuthoredSource(file)) { return false; }
    const feature = await loadInstalledCommandFeature(import.meta.url, "cli-workflow");
    await feature.run((options.argv ?? process.argv).slice(2));
    return true;
  }
  async function executeFile(file: string, parameters: string): Promise<void> {
    if (await delegateAuthoredSource(file)) { return; }
    const document = await fileJson(file);
    const graph = workflowGraph(document);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once("SIGINT", abort);
    try {
      const host = executionHost();
      const issues = validationIssues(host, graph);
      if (issues.length) { print({ valid: false, issues }); throw validationError(issues); }
      const params = z.record(z.string(), z.unknown()).parse(JSON.parse(parameters));
      print(await host.run({ graph, params, signal: controller.signal, userId: owner(), jobId: "cli-local", emit: () => {} }));
    } finally { process.removeListener("SIGINT", abort); }
  }
  program.command("info").description("Display system and environment information").option("--json", "Output as JSON").action((flags: { json?: boolean }) => {
    const names = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "OLLAMA_API_URL", "SERPAPI_API_KEY", "HF_TOKEN"];
    const data = { version, node_version: process.version, platform: process.platform, arch: process.arch,
      api_keys: Object.fromEntries(names.map(name => [name, env[name] ? "configured" : "not set"])),
      environment: { ENV: env.ENV ?? "development", LOG_LEVEL: env.LOG_LEVEL ?? "INFO", PORT: env.PORT ?? "7777" }
    };
    if (flags.json) { print(data); return; }
    output("\nNodeTool System Information\n\n");
    printTable([{ property: "Version", value: data.version }, { property: "Node.js", value: data.node_version }, { property: "Platform", value: `${data.platform}/${data.arch}` }]);
    output("\nAPI Keys:\n");
    printTable(Object.entries(data.api_keys).map(([key, status]) => ({ key, status })));
    output("\nEnvironment:\n");
    printTable(Object.entries(data.environment).map(([variable, value]) => ({ variable, value })));
    output("\n");
  });
  program.command("nodes").description("List the built-in node types usable by `run` without installing packs (JSON)").option("--example", "Print a runnable example workflow instead").option("-m, --model <id>", "Model for the example workflow", env.NODETOOL_TEXT_MODEL ?? DEFAULT_TEXT_MODEL).action((flags: { example?: boolean; model: string }) => {
    if (flags.example) { print(exampleWorkflow(flags.model)); return; }
    print({
      note: "Workflow JSON is {nodes:[{id,type,properties}],edges:[{source,sourceHandle,target,targetHandle}]} (optionally wrapped as {graph}). Wire an output name into an input name; dynamic-input nodes accept any targetHandle. Nodes from packs need `nodetool packs add <pack>`; `nodetool nodes --example` prints a complete workflow.",
      nodes: executionHost().describe()
    });
  });
  program.command("run <file>").description("Execute a saved workflow JSON file locally (see `nodetool nodes`)").option("--params <json>", "Workflow parameters", "{}").action(async (file: string, flags: { params: string }) => executeFile(file, flags.params));
  program.command("validate <file>").description("Validate a native JSON workflow or explicitly installed authored-source workflow").action(async (file: string) => {
    if (await delegateAuthoredSource(file)) { return; }
    const document = await fileJson(file);
    const graph = workflowGraph(document);
    const issues = validationIssues(executionHost(), graph);
    print({ valid: issues.length === 0, issues });
    if (issues.length) throw validationError(issues);
  });
  const workflows = program.command("workflows").description("Manage authenticated workflows");
  workflows.command("list").option("--limit <number>").option("--cursor <id>").option("--project-id <id>").option("--run-mode <mode>").action(async (flags: { limit?: string; cursor?: string; projectId?: string; runMode?: string }) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ limit: flags.limit, cursor: flags.cursor, project_id: flags.projectId, run_mode: flags.runMode })) if (value) query.set(key, value);
    print(await json(`/api/workflows?${query}`));
  });
  workflows.command("get <id>").action(async (id: string) => print(await json(`/api/workflows/${segment(id)}`)));
  workflows.command("create <file>").action(async (file: string) => print(await json("/api/workflows", "POST", await fileJson(file))));
  workflows.command("update <id> <file>").action(async (id: string, file: string) => print(await json(`/api/workflows/${segment(id)}`, "PUT", await fileJson(file))));
  workflows.command("delete <id>").action(async (id: string) => print(await json(`/api/workflows/${segment(id)}`, "DELETE")));
  workflows.command("run <id>").option("--params <json>", "Workflow parameters", "{}").action(async (id: string, flags: { params: string }) => print(await json(`/api/workflows/${segment(id)}/run`, "POST", { params: JSON.parse(flags.params) })));
  const jobs = program.command("jobs");
  jobs.command("list").action(async () => print(await json("/api/jobs")));
  jobs.command("get <id>").action(async (id: string) => print(await json(`/api/jobs/${segment(id)}`)));
  jobs.command("cancel <id>").action(async (id: string) => print(await json(`/api/jobs/${segment(id)}/cancel`, "POST")));
  const assets = program.command("assets");
  assets.command("upload <file>").action(async (file: string) => {
    const response = await request("/api/assets", { method: "POST", body: await readFile(file), headers: { "content-type": "application/octet-stream" } });
    print(await response.json());
  });
  assets.command("get <id>").action(async (id: string) => print(await json(`/api/assets/${segment(id)}`)));
  assets.command("download <id> <file>").action(async (id: string, file: string) => { const response = await request(`/api/storage/${segment(id)}`); await writeFile(file, Buffer.from(await response.arrayBuffer())); });
  assets.command("delete <id>").action(async (id: string) => print(await json(`/api/assets/${segment(id)}`, "DELETE")));
  const secrets = program.command("secrets").description("Manage encrypted secrets: on the server with a token, otherwise in the local store (needs SECRETS_MASTER_KEY)");
  secrets.command("list").description("List secret names (never values)").action(async () => {
    if (hasToken()) { print(await json("/api/secrets")); return; }
    print(await withLocalRepository(async repository => (await repository.list("secrets", owner())).map(({ encrypted_value: _encrypted, ...metadata }) => metadata)));
  });
  secrets.command("set <key>").alias("store").description("Read a secret value from stdin, e.g. printf %s \"$OPENAI_API_KEY\" | nodetool secrets set OPENAI_API_KEY").action(async (key: string) => {
    if (process.stdin.isTTY) throw new Error("Pipe the secret value on stdin, e.g. printf %s \"$VALUE\" | nodetool secrets set KEY");
    const value = (await readStdin()).replace(/\r?\n$/, "");
    if (hasToken()) { print(await json("/api/secrets", "POST", { key, value })); return; }
    const masterKey = requireMasterKey("store secrets locally");
    const userId = owner();
    print(await withLocalRepository(async repository => {
      const existing = (await repository.list("secrets", userId)).find(secret => secret.key === key);
      const { encrypted_value: _encrypted, ...metadata } = await repository.put("secrets", userId, { ...existing, key, description: existing?.description ?? "", encrypted_value: encrypt(masterKey, userId, value) });
      return metadata;
    }));
  });
  const openAIProvider = { id: "openai", name: "OpenAI-compatible", capabilities: ["text", "models"], installed: true };
  const providers = program.command("providers").description("Inspect installed remote provider capabilities");
  providers.command("list").action(() => print([openAIProvider]));
  providers.command("info [provider]").action(async (providerId = "openai") => {
    if (providerId === "openai") { print(openAIProvider); return; }
    const feature = await loadInstalledCommandFeature(import.meta.url, "cli-models");
    await feature.run((options.argv ?? process.argv).slice(2));
  });
  const models = program.command("models").description("List remote models using a tenant's configured provider");
  models.command("providers").action(() => print([openAIProvider]));
  models.command("list").option("-p, --provider <provider>", "Remote provider", "openai").option("--json", "Output JSON (the default)").action(async (flags: { provider: string }) => {
    if (flags.provider !== "openai") {
      const feature = await loadInstalledCommandFeature(import.meta.url, "cli-models");
      await feature.run((options.argv ?? process.argv).slice(2));
      return;
    }
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once("SIGINT", abort);
    try { print({ provider: flags.provider, models: await (await provider()).listModels(controller.signal) }); }
    finally { process.removeListener("SIGINT", abort); }
  });
  for (const name of ["recommended", "huggingface", "hf", "ollama", "by-provider", "storage"]) {
    models.command(name).description("Requires the independently installed cli-models feature").helpOption(false).allowUnknownOption().allowExcessArguments().action(async () => {
      const feature = await loadInstalledCommandFeature(import.meta.url, "cli-models");
      await feature.run((options.argv ?? process.argv).slice(2));
    });
  }
  program.command("text [prompt]").description("Stream one completion from an OpenAI-compatible model (prompt from argument or stdin; uses OPENAI_API_KEY)")
    .option("-m, --model <id>", "Model ID (or NODETOOL_TEXT_MODEL)", env.NODETOOL_TEXT_MODEL ?? DEFAULT_TEXT_MODEL)
    .option("-s, --system <text>", "System prompt")
    .option("--json", "Print one JSON object {model,text,usage} instead of streaming text")
    .action(async (argument: string | undefined, flags: { model: string; system?: string; json?: boolean }) => {
      const prompt = argument === undefined || argument === "-" ? process.stdin.isTTY ? "" : await readStdin() : argument;
      if (!prompt.trim()) throw new Error("Provide a prompt argument or pipe one on stdin");
      const messages: { role: "system" | "user"; content: string }[] = [];
      if (flags.system) messages.push({ role: "system", content: flags.system });
      messages.push({ role: "user", content: prompt });
      const controller = new AbortController();
      const abort = (): void => controller.abort();
      process.once("SIGINT", abort);
      try {
        let text = "";
        let usage: unknown = null;
        for await (const chunk of (await provider()).stream({ model: flags.model, messages, signal: controller.signal })) {
          if (chunk.done) { usage = chunk.usage; continue; }
          if (flags.json) { text += chunk.text; } else { output(chunk.text); }
        }
        if (flags.json) { print({ model: flags.model, text, usage }); } else { output("\n"); }
      } finally { process.removeListener("SIGINT", abort); }
    });
  program.command("serve").description("Start the minimal execution server with explicitly configured server features.").option("--host <host>", "Listen address", env.HOST ?? "127.0.0.1").option("--port <port>", "Listen port", env.PORT ?? "7777").action(async (flags: { host: string; port: string }) => {
    const masterKey = requireMasterKey("start the server (it encrypts tenant secrets)");
    const tokens = serverTokens();
    type ConfiguredFeature = NonNullable<Parameters<typeof createMinimalServer>[0]["features"]>[number];
    type Feature = Awaited<ReturnType<ConfiguredFeature["load"]>>;
    const features: ConfiguredFeature[] = [];
    for (const entry of (env.NODETOOL_FEATURES ?? "").split(",").filter(Boolean)) {
      const separator = entry.indexOf("=");
      const id = entry.slice(0, separator);
      const specifier = entry.slice(separator + 1);
      if (separator < 1 || !/^(@[a-z0-9-]+\/)?[a-z0-9-]+(\/[a-z0-9/.-]+)?$/.test(specifier)) throw new Error("NODETOOL_FEATURES entries must be feature-id=installed-package");
      features.push({ id, load: async () => {
        const module = z.record(z.string(), z.unknown()).parse(await import(specifier));
        return z.object({
          descriptor: z.object({ id: z.string(), apiVersion: z.number(), packageName: z.string().optional(), packId: z.string().nullable().optional(), requires: z.array(z.string()).optional(), capabilities: z.array(z.string()).optional(), nodeTypes: z.array(z.string()).optional() }),
          activate: z.custom<Feature["activate"]>(value => z.function().safeParse(value).success)
        }).parse(module.default);
      } });
    }
    refusePackInstallsInProcess("serve");
    const configuration: { directory: string; masterKey: string; tokens: Record<string, string>; features: ConfiguredFeature[]; openAIBaseURL?: string } = { directory: directory(), masterKey, tokens, features };
    if (env.OPENAI_BASE_URL) { configuration.openAIBaseURL = env.OPENAI_BASE_URL; }
    const app = await createMinimalServer(configuration);
    const close = (): void => { void app.close().catch(() => { process.exitCode = 1; }); };
    process.once("SIGINT", close); process.once("SIGTERM", close);
    try { print({ url: await app.listen({ host: flags.host, port: Number(flags.port) }) }); }
    catch (error) {
      await app.close();
      if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") throw new Error(`Port ${flags.port} is already in use (the NodeTool desktop app uses 7777). Pass --port or set PORT, and point clients at it with NODETOOL_API_URL.`);
      throw error;
    }
  });
  program.command("feature <id> [args...]").description("Run a command from one explicitly installed command feature").helpOption(false).allowUnknownOption().allowExcessArguments().action(async (featureId: string) => {
    const feature = await loadInstalledCommandFeature(import.meta.url, featureId);
    const argv = [...(options.argv ?? process.argv)];
    const index = argv.indexOf("feature", 2);
    argv.splice(index, 2);
    await feature.run(argv.slice(2));
  });
  configureCliPackHost(import.meta.url);
  registerPackCommands(program, import.meta.url);
  const native = new Set(program.commands.map(command => command.name()));
  for (const [name, featureId] of Object.entries(COMMAND_FEATURES)) {
    if (native.has(name)) { continue; }
    program.command(name).description(`Requires the ${featureId} feature (nodetool packs add ${featureId} --yes)`).helpOption(false).allowUnknownOption().allowExcessArguments().action(async () => {
      const feature = await loadInstalledCommandFeature(import.meta.url, featureId);
      await feature.run((options.argv ?? process.argv).slice(2));
    });
  }
  return program;
}
/** Dispatch native commands or one explicitly installed command feature. */
export async function runCli(argv: readonly string[] = process.argv): Promise<void> {
  let commandIndex = 2;
  let workflowTrace = false;
  while (commandIndex < argv.length) {
    const argument = argv[commandIndex];
    if (argument === "--api-url" || argument === "--token") { commandIndex += 2; }
    else if (argument?.startsWith("--api-url=") || argument?.startsWith("--token=")) { commandIndex++; }
    else if (argument === "--trace-file") { workflowTrace = true; commandIndex += 2; }
    else if (argument?.startsWith("--trace-file=") || argument?.startsWith("--trace-stdout=") || argument === "--no-trace-stdout") { workflowTrace = true; commandIndex++; }
    else if (argument === "--trace-stdout") {
      workflowTrace = true;
      commandIndex += ["pretty", "json"].includes(argv[commandIndex + 1] ?? "") ? 2 : 1;
    }
    else { break; }
  }
  const command = argv[commandIndex];
  const explicitlySelected = command === "feature" ? argv[commandIndex + 1] : undefined;
  if (explicitlySelected) {
    const feature = await loadInstalledCommandFeature(import.meta.url, explicitlySelected);
    const delegated = [...argv];
    delegated.splice(commandIndex, 2);
    await feature.run(delegated.slice(2));
    return;
  }
  if ((command === "run" || command === "validate" || command === "workflows" && argv[commandIndex + 1] === "run") && (workflowTrace || argv.slice(commandIndex + 1).some(argument => !argument.startsWith("-") && isAuthoredSource(argument)))) {
    const feature = await loadInstalledCommandFeature(import.meta.url, "cli-workflow");
    await feature.run(argv.slice(2));
    return;
  }
  if (command === "workflows" && argv[commandIndex + 1] === "migrate-code-inputs") {
    const feature = await loadInstalledCommandFeature(import.meta.url, "cli-admin");
    await feature.run(argv.slice(2));
    return;
  }
  const program = createProgram({ argv });
  const nativeCommands = new Set(["run", "validate", "workflows", "jobs", "assets", "secrets", "providers", "models", "serve", "packs"]);
  const featureId = command ? COMMAND_FEATURES[command] : undefined;
  if (featureId && !nativeCommands.has(command ?? "")) {
    const feature = await loadInstalledCommandFeature(import.meta.url, featureId);
    const delegated = [...argv];
    if (command === "server") { delegated.splice(commandIndex, 1); }
    await feature.run(delegated.slice(2));
    return;
  }
  const group = program.commands.find(candidate => candidate.name() === command);
  const subcommand = argv[commandIndex + 1];
  if (featureId && group?.commands.length && subcommand && !subcommand.startsWith("-") && !group.commands.some(candidate => candidate.name() === subcommand || candidate.aliases().includes(subcommand))) {
    const feature = await loadInstalledCommandFeature(import.meta.url, featureId);
    await feature.run(argv.slice(2));
    return;
  }
  await program.parseAsync([...argv]);
}
