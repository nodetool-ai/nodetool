import { trimHyphens } from "@nodetool-ai/cli-common/trimHyphens";
import { resolveWorkflowPacks } from "./workflow-packs.js";
import { installLocalModelInterfaces } from "@nodetool-ai/cli-execution/local-model-interfaces";
import { configureCliPackHost } from "@nodetool-ai/cli-execution/packs/host";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { resolveLocalSecret } from "@nodetool-ai/cli-local/local-secrets";
import { Command as CommanderCommand, type Command } from "commander";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { type Intervention } from "@nodetool-ai/protocol";
import { workflowToDsl, workflowToScript } from "@nodetool-ai/dsl";
import {
  initDb,
  migrateSqliteDb,
  Workflow,
  Asset,
  Secret,
  getSecret
} from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { getDefaultDbPath, getDefaultAssetsPath } from "@nodetool-ai/config";
import { ExecutionSession, type RawGraphInput } from "@nodetool-ai/execution";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { registerCliPacks } from "@nodetool-ai/cli-execution/packs/host";
import {
  CLI_LOCAL_BUILTIN_PACK_POLICY,
  CLI_DSL_BUILTIN_PACK_POLICY
} from "@nodetool-ai/cli-execution/node-registry";
import {
  ProcessingContext,
  createLocalWorkspace,
  initTelemetry
} from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import type { AssetOutputMode } from "@nodetool-ai/runtime";
import { mkdirSync } from "node:fs";
import {
  addSupervisorOptions,
  createSupervisorHandle,
  parseSupervisorFlags,
  printSupervisedSummary,
  recordSupervisorCost,
  streamInterventionLines,
  type SupervisorCliOptions
} from "@nodetool-ai/cli-execution/supervisor";
import { installMissingPacksAndReexec } from "./commands/install-missing-packs.js";
import { registerDebugCommands } from "./commands/debug.js";
import { registerValidateCommand } from "./commands/validate.js";
import { registerNodeCommands } from "./commands/node.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerCollectionCommands } from "./commands/collections.js";
import { registerCostsCommands } from "./commands/costs.js";
import { registerErrorsCommands } from "./commands/errors.js";
import { registerGenerationsCommands } from "./commands/generations.js";
import { registerRunsCommands } from "./commands/runs.js";
import { registerProjectCommands } from "./commands/projects.js";

import {
  finishCliTelemetry,
  startCliTelemetry,
  trackCliEvent
} from "@nodetool-ai/cli-common/telemetry";
import {
  bucketDuration,
  bucketNodeCount,
  categorizeError
} from "@nodetool-ai/analytics";
import { registerResourceReadCommands } from "./commands/resource-read.js";
import { createApiClient } from "./api-client.js";
import { closePythonProviders } from "@nodetool-ai/cli-providers";
import { isString } from "@nodetool-ai/cli-common/predicates";
import {
  printTable,
  asJson,
  readSecretValue
} from "@nodetool-ai/cli-common/commands/output";
import {
  printCommandError,
  commandMissingRuntime,
  commandMissingPack
} from "@nodetool-ai/pack-manager/command-errors";

const CLI_VERSION = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--;
  }
  return value.slice(0, end);
}
export async function createProgram(): Promise<CommanderCommand> {
  const program = new CommanderCommand();
  // ---------------------------------------------------------------------------
  // DB setup (for secrets commands)
  // ---------------------------------------------------------------------------

  // The local single-user id every direct-DB command runs as, matching the
  // `workflows run` / `secrets` commands and the stdio MCP server.

  const LOCAL_USER_ID = "1";
  type CreatedWorkflowRow = Awaited<ReturnType<typeof Workflow.create>>;

  // Open the local SQLite database for a read-only command. Unlike setupDb() this
  // skips master-key unlocking (no secret decryption needed to list/read rows),
  // so it never emits a keychain warning. Idempotent — initDb() is a no-op once
  // a connection is open.
  function ensureDb(): void {
    initDb(getDefaultDbPath());
  }

  async function setupDb(): Promise<void> {
    const dbPath = getDefaultDbPath();
    await migrateSqliteDb(dbPath);
    initDb(dbPath);
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
              url = j.get_url.startsWith("/")
                ? `${apiUrl}${j.get_url}`
                : j.get_url;
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

  // Resolve asset bytes from the local assets directory, so the export commands
  // work by id without a running server. `asset://<key>` is tried verbatim as a
  // storage key first (that's how import-bundle writes refs), then via the DB
  // record to derive `<id>.<ext>` from the content type. Remote http(s) refs
  // still fetch over the network.
  async function makeLocalAssetFetcher(): Promise<
    (ref: string) => Promise<Uint8Array | null>
  > {
    const { getAssetFileName } = await import("@nodetool-ai/protocol");
    const storage = new FileStorageAdapter(getDefaultAssetsPath());
    return async (ref: string): Promise<Uint8Array | null> => {
      if (ref.startsWith("asset://")) {
        const raw = ref.slice("asset://".length);
        const direct = await storage.retrieve(`/api/storage/${raw}`);
        if (direct) return direct;
        const bareId = raw.replace(/\.[^.]+$/, "");
        const asset = await Asset.find(LOCAL_USER_ID, bareId);
        if (!asset) return null;
        const key = getAssetFileName(asset.id, asset.content_type);
        return storage.retrieve(`/api/storage/${key}`);
      }
      if (ref.includes("/api/storage/")) {
        const local = await storage.retrieve(ref);
        if (local) return local;
      }
      if (/^https?:\/\//.test(ref)) {
        const res = await fetch(ref);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      }
      return null;
    };
  }

  // Asset and timeline persistence for every context any command builds, here
  program
    .name("nodetool")
    .description("NodeTool CLI")
    .version(CLI_VERSION)
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
    // A command that started the Python worker must stop it, or the worker
    // child process keeps the CLI alive after the output.
    .hook("postAction", async () => {
      closePythonProviders();
      await finishCliTelemetry();
    })
    .hook("preAction", async (thisCommand, actionCommand) => {
      // Anonymous usage analytics, off unless `nodetool telemetry enable` ran.
      // Only the matched top-level command name is used, never argv.
      startCliTelemetry(topLevelCommandName(actionCommand));
      // With `--trace`, the `debug` command owns telemetry: it routes spans into
      // its bundle's trace.jsonl via its own initTelemetry call. Initializing here
      // first would win the one-shot init and drop that file sink, so skip it.
      // Without `--trace`, fall through so the global --trace-file/--trace-stdout
      // flags still work for a debug run.
      if (actionCommand?.name() === "debug" && actionCommand.opts()["trace"])
        return;
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

  /** The name of the top-level command an action belongs to. */
  function topLevelCommandName(
    command: Command | undefined
  ): string | undefined {
    let current = command;
    while (current?.parent && current.parent.parent) {
      current = current.parent;
    }
    return current?.name();
  }

  function parseTraceStdout(v: string | boolean): "pretty" | "json" | false {
    if (v === false) return false;
    if (v === true) return "pretty";
    if (isString(v)) {
      const lower = v.toLowerCase();
      if (lower === "false" || lower === "0" || lower === "no") return false;
      if (lower === "json") return "json";
      if (lower === "pretty" || lower === "true" || lower === "1")
        return "pretty";
    }
    throw new Error(
      `--trace-stdout must be 'pretty' or 'json' (got ${JSON.stringify(v)})`
    );
  }

  // ---------------------------------------------------------------------------
  // run — execute a TypeScript/JavaScript DSL workflow file
  // ---------------------------------------------------------------------------

  addSupervisorOptions(
    program
      .command("run <dsl-file>")
      .description("Run a TypeScript/JavaScript DSL workflow file")
      .option("--json", "Output results as JSON (default: pretty-print)")
      .option(
        "--install-missing",
        "Authorize missing node pack installation, then re-execute once"
      )
  ).action(
    async (
      dslFile: string,
      opts: { json?: boolean; installMissing?: boolean } & SupervisorCliOptions
    ) => {
      try {
        const { resolve } = await import("node:path");
        const { runDslFile } =
          await import("@nodetool-ai/cli-execution/run-dsl");
        const { NodeRegistry } = await import("@nodetool-ai/node-sdk");

        await registerCliPacks(
          NodeRegistry.global,
          CLI_DSL_BUILTIN_PACK_POLICY
        );

        const supervisorConfig = parseSupervisorFlags(opts);
        const absolutePath = resolve(dslFile);
        let results: Record<string, Record<string, unknown>>;
        let interventions: Intervention[] = [];
        if (supervisorConfig) {
          // The supervisor's provider key comes from the secret store, and its
          // spend is written to the local ledger — both need the DB.
          await setupDb();
          const { runDslFileSupervised } =
            await import("@nodetool-ai/cli-execution/run-dsl-supervised");
          const run = await runDslFileSupervised(
            absolutePath,
            supervisorConfig,
            opts.json === true
          );
          results = run.results;
          interventions = run.interventions;
        } else {
          results = await runDslFile(absolutePath);
        }

        const { printRunJson, previewJson } =
          await import("@nodetool-ai/cli-execution/run-json");
        if (opts.json) {
          // A supervised run reports what the supervisor did alongside the
          // outputs; an unsupervised one keeps the bare results shape.
          await printRunJson(
            supervisorConfig ? { results, interventions } : results
          );
        } else {
          for (const [workflowName, outputs] of Object.entries(results)) {
            console.log(`\n${workflowName}:`);
            for (const [key, value] of Object.entries(outputs)) {
              console.log(`  ${key}: ${previewJson(value)}`);
            }
          }
        }
      } catch (e) {
        const exit = await installMissingPacksAndReexec(e, {
          command: "run",
          installMissing: opts.installMissing
        });
        if (exit !== null) {
          process.exit(exit);
        }
        process.exit(printCommandError(e, opts.json));
      }
    }
  );

  const workflows = program
    .command("workflows")
    .description("Workflow management");

  addSupervisorOptions(
    workflows
      .command("run <workflow_id_or_file>")
      .description("Run a workflow by ID, JSON file, or TypeScript DSL file")
      .option("--params <json>", "JSON params string")
      .option("--json", "Output as JSON")
      .option(
        "--install-missing",
        "Authorize missing node pack installation, then re-execute once"
      )
      .option(
        "--asset-output-mode <mode>",
        "How media outputs are materialized: native | raw | data_uri | workspace | storage_url | temp_url",
        "native"
      )
      .option(
        "--workspace <dir>",
        "Workspace directory for workspace-mode asset output (default: ./nodetool-output)"
      )
      .option(
        "--trigger-event <json>",
        'Wake a trigger node as the scheduler/webhook adapter would: \'{"node_id":"watch","payload":{"path":"/tmp/a.csv","event":"created"}}\'. ' +
          "Without it a webhook, file-watch or manual trigger has no event to " +
          "emit and the run stalls until its timeout — so this is the only way " +
          "to exercise a trigger-driven workflow from the CLI."
      )
  ).action(
    async (
      idOrFile: string,
      opts: {
        params?: string;
        json?: boolean;
        assetOutputMode?: string;
        workspace?: string;
        triggerEvent?: string;
        installMissing?: boolean;
      } & SupervisorCliOptions
    ) => {
      try {
        const supervisorConfig = parseSupervisorFlags(opts);
        await setupDb();
        let graph: RawGraphInput;
        let workflowId: string | null = null;
        const params = opts.params
          ? (JSON.parse(opts.params) as Record<string, unknown>)
          : {};

        // A trigger node emits from `emitTriggerEvent`, not `genProcess`, and
        // only when the run carries an event addressed to it. The kernel has
        // always accepted one (`RunJobRequest.trigger_event`); nothing on the
        // CLI could supply it, so a webhook or file-watch workflow could be
        // validated but never executed. `input_id` defaults because every
        // caller would otherwise invent the same throwaway id.
        const triggerEvent = opts.triggerEvent
          ? (() => {
              const parsed = JSON.parse(opts.triggerEvent) as {
                node_id?: string;
                payload?: unknown;
                input_id?: string;
              };
              if (!parsed.node_id) {
                throw new Error(
                  '--trigger-event needs a "node_id" naming the trigger node to wake.'
                );
              }
              return {
                node_id: parsed.node_id,
                payload: parsed.payload ?? {},
                input_id: parsed.input_id ?? `cli-${Date.now()}`
              };
            })()
          : null;

        // Determine if argument is a file path or workflow ID
        if (
          idOrFile.endsWith(".json") ||
          idOrFile.endsWith(".ts") ||
          idOrFile.endsWith(".tsx") ||
          idOrFile.includes("/") ||
          idOrFile.includes("\\")
        ) {
          /** A DSL/JSON workflow file: the graph, optionally wrapped. */
          let raw: {
            graph?: RawGraphInput;
            nodes?: readonly Record<string, unknown>[];
            edges?: readonly Record<string, unknown>[];
            workflow_id?: string;
            id?: string;
            params?: Record<string, unknown>;
          };
          if (idOrFile.endsWith(".ts") || idOrFile.endsWith(".tsx")) {
            const { readFileTarget } =
              await import("@nodetool-ai/cli-execution/debug/target");
            raw = (await readFileTarget(idOrFile)).raw as typeof raw;
          } else {
            const { readFileSync } = await import("node:fs");
            raw = JSON.parse(readFileSync(idOrFile, "utf8"));
          }
          graph = raw.graph ?? (raw as RawGraphInput);
          workflowId = raw.workflow_id ?? raw.id ?? null;
          if (raw.params) Object.assign(params, raw.params);
        } else {
          const wf = await Workflow.get(idOrFile);
          if (!wf) throw new Error(`Workflow not found: ${idOrFile}`);
          graph = (wf as any).graph;
          workflowId = idOrFile;
        }

        if (!graph?.nodes || !graph?.edges) {
          throw new Error("Invalid workflow: missing nodes or edges");
        }

        // Editor-only nodes (Comment, Group, Reroute) and the data→properties
        // rename are handled by `ExecutionSession.create` below, which runs
        // the graph through `normalizeGraph` (@nodetool-ai/execution) — no
        // need to duplicate that here.

        const registry = new NodeRegistry();
        await registerCliPacks(registry, CLI_LOCAL_BUILTIN_PACK_POLICY);

        const jobId = `job-${Date.now()}`;
        // Resolve asset URIs (e.g. /api/storage/<key>) against the local
        // assets directory, so workflows referencing stored assets run the
        // same decode path the server does.
        // Apply the workflow's assigned workspace (if any) so file ops and
        // workspace-driving nodes land in the same directory as a server run.
        const { resolveWorkflowWorkspace } =
          await import("@nodetool-ai/execution/service");
        const assignedWorkspace = workflowId
          ? await resolveWorkflowWorkspace(workflowId, "1")
          : null;
        const ASSET_OUTPUT_MODES = [
          "native",
          "raw",
          "data_uri",
          "workspace",
          "storage_url",
          "temp_url"
        ] as const;
        const assetOutputMode = (opts.assetOutputMode ??
          "native") as AssetOutputMode;
        if (!ASSET_OUTPUT_MODES.includes(assetOutputMode)) {
          throw new Error(
            `Unknown --asset-output-mode "${assetOutputMode}". ` +
              `Expected one of: ${ASSET_OUTPUT_MODES.join(", ")}`
          );
        }

        // `--workspace <dir>` wins, then whatever the workflow is assigned.
        // `workspace` asset mode writes each output into <workspace>/assets, so
        // it needs somewhere to write even when the run has no saved workflow (a
        // JSON or DSL file target). Fall back to ./nodetool-output so a bare
        // `workflows run file.json --asset-output-mode workspace` produces files
        // in the current directory rather than failing.
        const overrideWorkspaceDir =
          opts.workspace ??
          (assignedWorkspace
            ? null
            : assetOutputMode === "workspace"
              ? resolve(process.cwd(), "nodetool-output")
              : null);
        if (overrideWorkspaceDir) {
          mkdirSync(overrideWorkspaceDir, { recursive: true });
        }
        const runWorkspace = overrideWorkspaceDir
          ? createLocalWorkspace(overrideWorkspaceDir)
          : assignedWorkspace;

        const assetStorage = new FileStorageAdapter(getDefaultAssetsPath());
        const context = new ProcessingContext({
          jobId,
          workflowId,
          userId: "1",
          secretResolver: resolveLocalSecret,
          storage: assetStorage,
          assetOutputMode,
          workspace: runWorkspace
        });

        const supervisor = supervisorConfig
          ? await createSupervisorHandle({
              config: supervisorConfig,
              context
            })
          : null;

        console.error(
          `Running workflow${workflowId ? ` ${workflowId}` : ""}` +
            (supervisor
              ? ` supervised by ${supervisor.providerId}/${supervisor.model}`
              : "") +
            "..."
        );

        // ExecutionSession owns graph hydration, Python-bridge connection
        // (NODETOOL_WORKER_URL/NODETOOL_WORKER_TOKEN → remote worker; unset →
        // local stdio worker; pure-TS graphs get none), and executor
        // resolution (registry → Python bridge → throw).
        const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
          graph,
          registry,
          // Registry alone hydrates node flags but not `propertyTypes`, and
          // correlation analysis reads list-ness only from that map — so a
          // saved workflow (which never carries it) had every list handle
          // read as non-list, and legal fan-in into one was rejected before
          // any node ran. The resolver fills it from node metadata.
          resolveNodeType:
            createGraphNodeTypeResolver(registry).resolveNodeType,
          jobId,
          workflowId,
          params,
          context
        };
        if (triggerEvent) {
          sessionOptions.triggerEvent = triggerEvent;
        }
        // Message capture is retention, so it stays off unless a supervised
        // run needs the stream to print its `⛨` lines as they happen.
        if (supervisor) {
          sessionOptions.supervisor = supervisor.handle;
          sessionOptions.captureMessages = true;
        }
        const nodeCountBucket = bucketNodeCount(graph.nodes.length);
        trackCliEvent({
          event: "workflow_run",
          properties: { executionMode: "local", nodeCountBucket }
        });
        const runStartedAt = Date.now();
        const session = await ExecutionSession.create(sessionOptions);

        const interventionLines = supervisor
          ? streamInterventionLines(session.messages)
          : Promise.resolve();

        const result = await session.result;
        const durationBucket = bucketDuration(Date.now() - runStartedAt);
        if (result.status === "completed") {
          trackCliEvent({
            event: "workflow_run_succeeded",
            properties: {
              executionMode: "local",
              nodeCountBucket,
              durationBucket
            }
          });
        } else {
          trackCliEvent({
            event: "workflow_run_failed",
            properties: {
              executionMode: "local",
              nodeCountBucket,
              durationBucket,
              errorCategory:
                result.status === "cancelled"
                  ? "cancelled"
                  : categorizeError(result.error)
            }
          });
        }
        if (
          result.status === "failed" &&
          (commandMissingRuntime(result) || commandMissingPack(result))
        ) {
          const exit = await installMissingPacksAndReexec(result, {
            command: "workflows-run",
            installMissing: opts.installMissing
          });
          if (exit !== null) {
            process.exit(exit);
          }
          process.exit(printCommandError(result, opts.json));
        }
        await interventionLines;
        supervisor?.handle.close();

        const interventions = result.interventions ?? [];
        if (supervisor && interventions.length > 0) {
          await recordSupervisorCost({
            interventions,
            jobId,
            workflowId,
            userId: "1",
            providerId: supervisor.providerId,
            model: supervisor.model
          });
        }

        const { printRunJson, previewJson } =
          await import("@nodetool-ai/cli-execution/run-json");
        if (opts.json) {
          await printRunJson(result, {
            outputDir: resolve(process.cwd(), "nodetool-output", jobId)
          });
        } else {
          console.log(`Status: ${result.status}`);
          if (result.error) console.error(`Error: ${result.error}`);
          for (const [nodeId, outputs] of Object.entries(
            result.outputs ?? {}
          )) {
            if (Array.isArray(outputs) && outputs.length > 0) {
              console.log(`\nNode ${nodeId}:`);
              for (const out of outputs) {
                console.log(`  ${previewJson(out, 200)}`);
              }
            }
          }
          printSupervisedSummary(interventions);
        }

        await finishCliTelemetry();
        process.exit(result.status === "completed" ? 0 : 1);
      } catch (e) {
        const exit = await installMissingPacksAndReexec(e, {
          command: "workflows-run",
          installMissing: opts.installMissing
        });
        if (exit !== null) {
          process.exit(exit);
        }
        process.exit(printCommandError(e, opts.json));
      }
    }
  );

  workflows
    .command("export-script <workflow_id_or_file>")
    .description(
      "Convert a workflow into a JavaScript script that calls each node in order (local DB by id, or a JSON file)"
    )
    .option(
      "-t, --target <target>",
      "sandbox (a JS script document or Code node body) or node (a standalone Node.js .mjs)",
      "sandbox"
    )
    .option("-o, --output <file>", "Write the script to a file")
    .action(
      async (idOrFile: string, opts: { target: string; output?: string }) => {
        try {
          if (opts.target !== "sandbox" && opts.target !== "node") {
            throw new Error(
              `Unknown target "${opts.target}": use "sandbox" or "node"`
            );
          }
          let graph: Parameters<typeof workflowToScript>[0];
          let name: string | null;
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
            graph = (raw.graph ?? raw) as typeof graph;
            name = isString(raw.name) ? raw.name : null;
          } else {
            ensureDb();
            const wf = await Workflow.find(LOCAL_USER_ID, idOrFile);
            if (!wf) throw new Error(`Workflow not found: ${idOrFile}`);
            graph = wf.getGraph();
            name = isString(wf.name) ? wf.name : null;
          }

          const script = workflowToScript(graph, {
            target: opts.target,
            workflowName: name
          });
          for (const issue of script.unsupported) {
            console.error(
              `warning: ${issue.node_type} (${issue.node_id}) ${issue.message}`
            );
          }

          if (opts.output) {
            const { writeFile } = await import("node:fs/promises");
            await writeFile(opts.output, script.code, "utf8");
            console.log(opts.output);
            return;
          }

          console.log(script.code);
        } catch (e) {
          process.exit(printCommandError(e));
        }
      }
    );

  workflows
    .command("export-dsl <workflow_id_or_file>")
    .description(
      "Export a workflow as TypeScript DSL code (local DB by id; --api-url for remote)"
    )
    .option(
      "--api-url <url>",
      "Fetch the workflow from a remote server instead of the local database",
      process.env["NODETOOL_API_URL"]
    )
    .option("-o, --output <file>", "Write the exported DSL to a file")
    .action(
      async (idOrFile: string, opts: { apiUrl?: string; output?: string }) => {
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
              workflowName: isString(raw.name) ? raw.name : null
            });
          } else if (opts.apiUrl) {
            source = await apiGetText(
              opts.apiUrl,
              `/api/workflows/${idOrFile}/dsl-export`
            );
          } else {
            ensureDb();
            const wf = await Workflow.find(LOCAL_USER_ID, idOrFile);
            if (!wf) throw new Error(`Workflow not found: ${idOrFile}`);
            const graph = wf.getGraph();
            source = workflowToDsl(graph, {
              workflowName: isString(wf.name) ? wf.name : null
            });
          }

          if (opts.output) {
            const { writeFile } = await import("node:fs/promises");
            await writeFile(opts.output, source, "utf8");
            console.log(opts.output);
            return;
          }

          console.log(source);
        } catch (e) {
          process.exit(printCommandError(e));
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
      "Fetch the workflow and asset bytes from a remote server instead of the local DB/assets",
      process.env["NODETOOL_API_URL"]
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
          apiUrl?: string;
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
          const { materializeWorkflowConstantAssets } =
            await import("@nodetool-ai/workflow-services");

          let name = "";
          let description = "";
          let tags: string[] = [];
          let graph: {
            nodes: Record<string, unknown>[];
            edges: Record<string, unknown>[];
          };

          const isFile =
            idOrFile.endsWith(".json") ||
            idOrFile.includes("/") ||
            idOrFile.includes("\\");

          if (isFile) {
            const raw = JSON.parse(readFileSync(idOrFile, "utf8")) as Record<
              string,
              unknown
            >;
            name = isString(raw.name) ? raw.name : "workflow";
            description = isString(raw.description) ? raw.description : "";
            tags = Array.isArray(raw.tags)
              ? raw.tags.filter((t): t is string => typeof t === "string")
              : [];
            graph = (raw.graph ?? raw) as typeof graph;
          } else if (opts.apiUrl) {
            const client = createApiClient(opts.apiUrl);
            const wf = await client.workflows.get.query({
              id: idOrFile
            });
            name = isString(wf.name) ? wf.name : "workflow";
            description = isString(wf.description) ? wf.description : "";
            tags = Array.isArray(wf.tags)
              ? wf.tags.filter((t): t is string => typeof t === "string")
              : [];
            graph = wf.graph as typeof graph;
          } else {
            ensureDb();
            const wf = await Workflow.find(LOCAL_USER_ID, idOrFile);
            if (!wf) throw new Error(`Workflow not found: ${idOrFile}`);
            name = isString(wf.name) ? wf.name : "workflow";
            description = isString(wf.description) ? wf.description : "";
            tags = Array.isArray(wf.tags)
              ? wf.tags.filter((t): t is string => typeof t === "string")
              : [];
            graph = wf.getGraph();
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
          const examplesDir =
            opts.examplesDir ?? join(baseNodesDir, "examples");

          const fetchAssetBytes = opts.apiUrl
            ? makeAssetFetcher(trimTrailingSlashes(opts.apiUrl))
            : await makeLocalAssetFetcher();

          const materializeOptions: Parameters<
            typeof materializeWorkflowConstantAssets
          >[1] = {
            packageName: opts.package,
            assetsRoot,
            fetchAssetBytes
          };
          if (opts.includeRemote) {
            materializeOptions.includeRemote = true;
          }
          const result = await materializeWorkflowConstantAssets(
            graph,
            materializeOptions
          );

          const slug = trimHyphens(
            name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
          );
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
            opts.output ??
            join(examplesDir, opts.package, `${safeFileName}.json`);
          await mkdir(dirname(outPath), { recursive: true });
          await writeFile(
            outPath,
            JSON.stringify(example, null, 2) + "\n",
            "utf8"
          );

          for (const a of result.exported) {
            console.error(
              `  asset ${a.source} → ${a.packageUri} (${a.byteLength} bytes)`
            );
          }
          for (const s of result.skipped) {
            console.error(
              `  warning: could not resolve asset ${s} (left as-is)`
            );
          }
          console.log(outPath);
        } catch (e) {
          process.exit(printCommandError(e));
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
      "Fetch the workflow and asset bytes from a remote server instead of the local DB/assets",
      process.env["NODETOOL_API_URL"]
    )
    .option("-o, --output <file>", "Output path (default: <name>.nodetool)")
    .option(
      "--include-remote",
      "Also embed http(s) and local-file refs (off by default)"
    )
    .action(
      async (
        idsOrFiles: string[],
        opts: { apiUrl?: string; output?: string; includeRemote?: boolean }
      ) => {
        try {
          const { readFileSync } = await import("node:fs");
          const { writeFile } = await import("node:fs/promises");
          const { packWorkflowsBundle } =
            await import("@nodetool-ai/workflow-services");

          type BundleWf = {
            name: string;
            description?: string;
            tags?: string[];
            run_mode?: string | null;
            settings?: Record<string, unknown> | null;
            graph: {
              nodes: Record<string, unknown>[];
              edges: Record<string, unknown>[];
            };
          };

          const toBundleWf = (raw: Record<string, unknown>): BundleWf => ({
            name: isString(raw.name) ? raw.name : "workflow",
            description: isString(raw.description) ? raw.description : "",
            tags: Array.isArray(raw.tags)
              ? raw.tags.filter((t): t is string => typeof t === "string")
              : [],
            run_mode: (raw.run_mode as string | null | undefined) ?? null,
            settings: (raw.settings as Record<string, unknown> | null) ?? null,
            graph: (raw.graph ?? raw) as BundleWf["graph"]
          });

          const useServer = Boolean(opts.apiUrl);
          const apiUrl = opts.apiUrl ? trimTrailingSlashes(opts.apiUrl) : "";
          if (!useServer) ensureDb();
          const workflowsToPack: BundleWf[] = [];
          for (const idOrFile of idsOrFiles) {
            const isFile =
              idOrFile.endsWith(".json") ||
              idOrFile.includes("/") ||
              idOrFile.includes("\\");
            let raw: Record<string, unknown>;
            if (isFile) {
              raw = JSON.parse(readFileSync(idOrFile, "utf8")) as Record<
                string,
                unknown
              >;
            } else if (useServer) {
              raw = await createApiClient(apiUrl).workflows.get.query({
                id: idOrFile
              });
            } else {
              const found = await Workflow.find(LOCAL_USER_ID, idOrFile);
              if (!found) throw new Error(`Workflow not found: ${idOrFile}`);
              raw = { ...found, graph: found.getGraph() };
            }
            const wf = toBundleWf(raw);
            if (!wf.graph?.nodes) {
              throw new Error(`Workflow '${idOrFile}' has no graph to export`);
            }
            workflowsToPack.push(wf);
          }

          const packOptions: Parameters<typeof packWorkflowsBundle>[0] = {
            workflows: workflowsToPack,
            fetchAssetBytes: useServer
              ? makeAssetFetcher(apiUrl)
              : await makeLocalAssetFetcher(),
            nodetoolVersion: cliVersion()
          };
          if (opts.includeRemote) {
            packOptions.includeRemote = true;
          }
          const { bytes, manifest, skipped } =
            await packWorkflowsBundle(packOptions);

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
            console.error(
              `  warning: could not resolve asset ${s} (left as-is)`
            );
          }
          console.error(
            `  bundled ${manifest.workflows.length} workflow(s), ${manifest.assets.length} asset(s)`
          );
          console.log(outPath);
        } catch (e) {
          process.exit(printCommandError(e));
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
        const { importWorkflowBundle } =
          await import("@nodetool-ai/workflow-services");

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

        const created: CreatedWorkflowRow[] = [];
        for (const wf of result.workflows) {
          created.push(
            await Workflow.create({
              user_id: "1",
              name: wf.name,
              description: wf.description ?? "",
              tags: wf.tags ?? [],
              access: "private",
              graph: wf.graph,
              run_mode: wf.run_mode ?? "workflow",
              settings: wf.settings ?? null
            })
          );
        }

        for (const s of result.missing) {
          console.error(
            `  warning: bundle asset ${s} was missing from the archive`
          );
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
            console.log(String(c.id));
          }
        }
      } catch (e) {
        process.exit(printCommandError(e, opts.json));
      }
    });

  // ---------------------------------------------------------------------------
  // jobs / assets — the read commands are registered from commands/resource-read.ts
  // ---------------------------------------------------------------------------

  const jobs = program.command("jobs").description("Job management");
  const assets = program.command("assets").description("Asset management");

  registerResourceReadCommands(
    { workflows, jobs, assets },
    { ensureDb, localUserId: LOCAL_USER_ID }
  );

  // ---------------------------------------------------------------------------
  // models
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
        process.exit(printCommandError(e));
      }
    });

  secrets
    .command("store <key>")
    .description("Store or update a secret (prompts for value)")
    .option("--user-id <id>", "User ID", "1")
    .option("--description <desc>", "Optional description")
    .action(async (key, opts) => {
      await setupDb();
      try {
        // Hidden on a TTY: an echoed value stays in the terminal scrollback.
        const value = await readSecretValue(`Enter value for '${key}': `);
        if (!value)
          throw new Error(`No value given for '${key}'; nothing stored.`);
        await Secret.upsert({
          userId: opts.userId,
          key,
          value,
          description: opts.description
        });
        console.log(`Secret '${key}' stored.`);
      } catch (e) {
        process.exit(printCommandError(e));
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
        process.exit(printCommandError(e));
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

  registerProjectCommands(program);
  registerDebugCommands(program);
  registerValidateCommand(program);
  registerNodeCommands(program);
  registerGenerateCommand(program);
  registerCollectionCommands(program);
  registerCostsCommands(program);
  registerErrorsCommands(program);
  registerGenerationsCommands(program);

  registerRunsCommands(program, {
    ensureDb: setupDb,
    localUserId: LOCAL_USER_ID
  });
  return program;
}
export async function run(argv: readonly string[]): Promise<void> {
  initializeCliRuntime(import.meta.url);
  configureCliPackHost(import.meta.url);
  await installLocalModelInterfaces();
  await (await createProgram()).parseAsync([...argv], { from: "user" });
}
export const feature = {
  descriptor: {
    id: "cli-workflow",
    apiVersion: 1,
    requires: ["core", "text"],
    capabilities: ["cli:workflow"]
  },
  run,
  resolveWorkflowPacks
};
export default feature;
