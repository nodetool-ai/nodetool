/**
 * Runs the app's workflows and JS scripts in this process.
 *
 * The graphs and script bodies come from `app.bundle.json`, never from the
 * request: the browser names a workflow or script by its bundle key and sends
 * the params, so nobody who can reach this server can make it run code the
 * app does not ship.
 *
 * What NodeTool keeps in its database (generated assets, timelines, scripts,
 * storyboards, sketches) is kept in files under the data folder instead, see
 * `store.mjs`.
 *
 * Provider keys (OPENAI_API_KEY, FAL_API_KEY, ...) are read from the process
 * environment, which `server/index.mjs` fills from `.env`. They never reach
 * the browser.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCodeBody } from "@nodetool-ai/agents";
import { scriptRunMessages, scriptStreamMessages } from "@nodetool-ai/app-runtime";
import { registerBuiltinPacks } from "@nodetool-ai/base-nodes/builtin-packs";
import {
  ExecutionSession,
  isExecutionPreflightError,
  toRawGraphInput
} from "@nodetool-ai/execution";
import {
  parseCarriedScriptDocument,
  scriptOperationInvocation
} from "@nodetool-ai/execution/app-debug";
import {
  emptyDeclaredJsScriptOutputsError,
  missingDeclaredJsScriptOutputs
} from "@nodetool-ai/execution/js-script-debug";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  headlessGate
} from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { createInputResolver, createMediaNormalizer } from "./media.mjs";
import { createLocalStore } from "./store.mjs";

/** Run messages a script relays while it runs: agent text, tool calls, progress. */
const RELAYED_MESSAGES = new Set([
  "chunk",
  "tool_call_update",
  "tool_result_update",
  "planning_update",
  "task_update",
  "node_progress"
]);

/** The workflows and scripts the app ships, by bundle key. */
export function loadBundleWorkflows(root) {
  const bundle = JSON.parse(readFileSync(join(root, "app.bundle.json"), "utf8"));
  const workflows = new Map();
  for (const workflow of bundle.workflows ?? []) {
    workflows.set(workflow.key, workflow);
  }
  const scripts = new Map();
  for (const script of bundle.scripts ?? []) {
    scripts.set(script.key, script);
  }
  return { bundle, workflows, scripts };
}

export function createRunner({ root, dataDir }) {
  const { workflows, scripts } = loadBundleWorkflows(root);
  // `package://<package>/<path>` sample inputs resolve from the copies the
  // export put under assets/.
  process.env.NODETOOL_PACKAGE_ASSETS_DIR ??= join(root, "assets");
  const registry = new NodeRegistry();
  registerBuiltinPacks(registry, { includeOptionalPacks: true });
  const { resolveNodeType } = createGraphNodeTypeResolver(registry);
  const storage = new FileStorageAdapter(join(dataDir, "storage"));
  const store = createLocalStore({ dataDir, storage });
  const normalize = createMediaNormalizer(storage, store.assetKey);
  const resolveInputs = createInputResolver(storage);
  const workspaceDir = join(dataDir, "workspace");
  mkdirSync(workspaceDir, { recursive: true });

  const createContext = (jobId, workflowId, onMessage) =>
    new ProcessingContext({
      jobId,
      workflowId,
      userId: "1",
      secretResolver: (key) => Promise.resolve(process.env[key] ?? null),
      storage,
      assetStorage: storage,
      workspaceDir,
      modelInterfaces: store.interfaces,
      // Output nodes would save every result a second time; outputs are
      // served from storage by URL instead.
      persistOutputAssets: false,
      ...(onMessage && { onMessage })
    });

  /**
   * Run one workflow and hand every message to `send`, media already rewritten
   * to URLs the browser can load. Resolves when the run has settled.
   */
  async function run({ workflowKey, params, jobId, signal, send }) {
    const workflow = workflows.get(workflowKey);
    if (!workflow) {
      throw new Error(`This app has no workflow "${workflowKey}"`);
    }
    const id = jobId || randomUUID();
    const context = createContext(id, workflowKey);
    let session;
    try {
      session = await ExecutionSession.create({
        graph: toRawGraphInput(workflow.graph),
        registry,
        resolveNodeType,
        jobId: id,
        workflowId: workflowKey,
        params: resolveInputs(params ?? {}),
        context,
        captureMessages: true,
        recordCosts: false
      });
    } catch (error) {
      // A graph this runtime cannot run (an unset model, a missing node
      // type) is the run's failure, said in the UI, not a server error.
      if (!isExecutionPreflightError(error)) throw error;
      send({ type: "job_update", status: "failed", job_id: id, error: error.message });
      return null;
    }
    const cancel = () => session.cancel("cancelled");
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      for await (const message of session.messages) {
        // Node-level messages carry no job id; the browser routes by it.
        const normalized = await normalize(message);
        send(normalized.job_id ? normalized : { ...normalized, job_id: id });
      }
      const result = await session.result;
      return result;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  /**
   * Run one JS script and hand `send` the messages the browser folds: what
   * the script relays while it runs, each `emit`, then its outputs and the
   * job's end, the same stream NodeTool's own app runtime builds from a
   * script run.
   */
  async function runScript({ scriptKey, params, jobId, signal, send }) {
    const script = scripts.get(scriptKey);
    if (!script) {
      throw new Error(`This app has no script "${scriptKey}"`);
    }
    // Parsing fills the defaults NodeTool applies, the timeout among them.
    const document = parseCarriedScriptDocument(script.document);
    if (!document) {
      throw new Error(`Script "${script.name}" is not a valid script document`);
    }
    const id = jobId || randomUUID();
    // Normalizing media is async; the chain keeps lines in the order they came.
    let relayed = Promise.resolve();
    const relay = (line) => {
      for (const message of scriptStreamMessages(line, id)) {
        relayed = relayed.then(async () => send(await normalize(message)));
      }
    };
    const context = createContext(id, null, (message) => {
      if (RELAYED_MESSAGES.has(message.type)) relay({ type: "message", message: { ...message } });
    });
    // Nobody is there to approve a guarded step, so the gate answers for them.
    context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("JS script run"));
    if (signal) context.signal = signal;

    const resolved = resolveInputs(params ?? {});
    const values = {};
    for (const port of document.inputs) {
      if (port.name in resolved) values[port.name] = resolved[port.name];
    }
    const { inputs, inputStreams } = scriptOperationInvocation(document, values);
    let result;
    try {
      result = await runCodeBody(context, {
        code: document.code,
        inputs,
        ...(inputStreams && { inputStreams }),
        secrets: document.secrets,
        timeoutSeconds: document.timeoutSeconds,
        withToolbelt: true,
        onEmit: (name, value) => relay({ type: "emit", name, value })
      });
    } catch (error) {
      result = { ok: false, logs: [], error: error instanceof Error ? error.message : String(error), duration_ms: 0 };
    }
    for (const line of result.logs ?? []) console.log(`[script ${scriptKey}] ${line}`);
    // Declaring outputs and setting none of them is a failed run.
    const missing = result.ok ? missingDeclaredJsScriptOutputs(document.outputs, result.outputs) : [];
    const settled = {
      ok: result.ok && missing.length === 0,
      outputs: result.outputs ?? {},
      // Emits already went out as they happened.
      streamed: [],
      logs: [],
      duration_ms: result.duration_ms ?? 0,
      ...(missing.length > 0
        ? { error: emptyDeclaredJsScriptOutputsError(missing) }
        : result.error !== undefined && { error: result.error })
    };
    await relayed;
    for (const message of scriptRunMessages(settled, id)) {
      send(await normalize(message));
    }
    return settled;
  }

  return { run, runScript, storage };
}
