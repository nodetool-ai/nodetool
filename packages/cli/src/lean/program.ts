import { printTable } from "@nodetool-ai/pack-manager/commands/output";
import { refusePackInstallsInProcess } from "@nodetool-ai/pack-manager/packs/install-process";
import { configureCliPackHost, registerPackCommands, loadInstalledCommandFeature } from "@nodetool-ai/pack-manager";
import { z } from "zod";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { createMinimalServer, OPTIONAL_FEATURE_CATALOG } from "@nodetool-ai/server-minimal";
import { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import { OpenAITextProvider } from "@nodetool-ai/runtime-core";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { decrypt } from "@nodetool-ai/security-core";
import { COMMAND_FEATURES } from "./commandFeatures.js";
import { featureRecovery } from "@nodetool-ai/server-features";
import { cliFailureSchema } from "./errors.js";

export interface CliOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly argv?: readonly string[];
  readonly stdout?: (value: string) => void;
  readonly fetch?: typeof fetch;
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
  const program = new Command("nodetool").description("Authenticated workflow execution server and client").version(version);
  program.configureOutput({ writeOut: output });
  program.option("--api-url <url>", "Server URL", env.NODETOOL_API_URL ?? "http://127.0.0.1:7777").option("--token <token>", "Authentication token (or NODETOOL_API_TOKEN)", env.NODETOOL_API_TOKEN);
  const directory = (): string => resolve(env.NODETOOL_DATA_DIR ?? "./nodetool-data");
  const owner = (): string => { if (!env.NODETOOL_USER_ID) throw new Error("Set NODETOOL_USER_ID for local execution"); return env.NODETOOL_USER_ID; };
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const flags = program.opts<{ apiUrl: string; token?: string }>();
    if (!flags.token) throw new Error("Set NODETOOL_API_TOKEN or --token");
    const url = new URL(path, `${flags.apiUrl.replace(/\/$/, "")}/`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Server URL must use HTTP(S) without credentials");
    const response = await transport(url, { ...init, headers: { authorization: `Bearer ${flags.token}`, ...init.headers }, redirect: "error" });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Server returned ${response.status}: ${text}`);
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
  async function provider(): Promise<OpenAITextProvider> {
    const userId = owner();
    const masterKey = env.SECRETS_MASTER_KEY;
    if (!masterKey) throw new Error("Set SECRETS_MASTER_KEY to read tenant secrets");
    await mkdir(directory(), { recursive: true });
    const repository = createSqliteRepository(join(directory(), "nodetool.db"));
    try {
      const secret = (await repository.list("secrets", userId)).find(row => row.key === "OPENAI_API_KEY");
      if (!secret) throw new Error("Configure OPENAI_API_KEY in this user's secrets first");
      const configuration: { apiKey: string; baseURL?: string; fetch: typeof globalThis.fetch } = { fetch: transport, apiKey: decrypt(masterKey, userId, z.string().parse(secret.encrypted_value)) };
      if (env.OPENAI_BASE_URL) configuration.baseURL = env.OPENAI_BASE_URL;
      return new OpenAITextProvider(configuration);
    } finally { await repository.close(); }
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
  program.command("run <file>").description("Execute a saved workflow JSON file locally").option("--params <json>", "Workflow parameters", "{}").action(async (file: string, flags: { params: string }) => executeFile(file, flags.params));
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
  const secrets = program.command("secrets");
  secrets.command("list").action(async () => print(await json("/api/secrets")));
  secrets.command("set <key>").alias("store").description("Read a secret value from stdin").action(async (key: string) => {
    let value = "";
    for await (const bytes of process.stdin) value += String(bytes);
    print(await json("/api/secrets", "POST", { key, value: value.replace(/\r?\n$/, "") }));
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
  program.command("text <prompt>").requiredOption("--model <id>").action(async (prompt: string, flags: { model: string }) => {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once("SIGINT", abort);
    try {
      for await (const chunk of (await provider()).stream({ model: flags.model, messages: [{ role: "user", content: prompt }], signal: controller.signal })) {
        if (!chunk.done) { output(chunk.text); }
      }
      output("\n");
    } finally { process.removeListener("SIGINT", abort); }
  });
  program.command("serve").description("Start the minimal execution server with explicitly configured server features.").option("--host <host>", "Listen address", env.HOST ?? "127.0.0.1").option("--port <port>", "Listen port", env.PORT ?? "7777").action(async (flags: { host: string; port: string }) => {
    const tokens = z.record(z.string(), z.string()).parse(JSON.parse(env.NODETOOL_TOKENS ?? "null"));
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
    const configuration: { directory: string; masterKey: string; tokens: Record<string, string>; features: ConfiguredFeature[]; openAIBaseURL?: string } = { directory: directory(), masterKey: env.SECRETS_MASTER_KEY ?? "", tokens, features };
    if (env.OPENAI_BASE_URL) { configuration.openAIBaseURL = env.OPENAI_BASE_URL; }
    const app = await createMinimalServer(configuration);
    const close = (): void => { void app.close().catch(() => { process.exitCode = 1; }); };
    process.once("SIGINT", close); process.once("SIGTERM", close);
    try { print({ url: await app.listen({ host: flags.host, port: Number(flags.port) }) }); }
    catch (error) { await app.close(); throw error; }
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
    program.command(name).description(`Requires the independently installed ${featureId} feature`).helpOption(false).allowUnknownOption().allowExcessArguments().action(async () => {
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
