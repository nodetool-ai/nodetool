/**
 * Runs the app's workflows in this process.
 *
 * The graphs come from `app.bundle.json`, never from the request: the browser
 * names a workflow by its bundle key and sends the params, so nobody who can
 * reach this server can make it run a graph the app does not ship.
 *
 * Provider keys (OPENAI_API_KEY, FAL_API_KEY, ...) are read from the process
 * environment, which `server/index.mjs` fills from `.env`. They never reach
 * the browser.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerBuiltinPacks } from "@nodetool-ai/base-nodes/builtin-packs";
import { ExecutionSession, toRawGraphInput } from "@nodetool-ai/execution";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { createInputResolver, createMediaNormalizer } from "./media.mjs";

/** The workflows the app ships, by bundle key. */
export function loadBundleWorkflows(root) {
  const bundle = JSON.parse(readFileSync(join(root, "app.bundle.json"), "utf8"));
  const workflows = new Map();
  for (const workflow of bundle.workflows ?? []) {
    workflows.set(workflow.key, workflow);
  }
  return { bundle, workflows };
}

export function createRunner({ root, dataDir }) {
  const { workflows } = loadBundleWorkflows(root);
  // `package://<package>/<path>` sample inputs resolve from the copies the
  // export put under assets/.
  process.env.NODETOOL_PACKAGE_ASSETS_DIR ??= join(root, "assets");
  const registry = new NodeRegistry();
  registerBuiltinPacks(registry, { includeOptionalPacks: true });
  const { resolveNodeType } = createGraphNodeTypeResolver(registry);
  const storage = new FileStorageAdapter(join(dataDir, "storage"));
  const normalize = createMediaNormalizer(storage);
  const resolveInputs = createInputResolver(storage);

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
    const context = new ProcessingContext({
      jobId: id,
      workflowId: workflowKey,
      userId: "1",
      secretResolver: (key) => Promise.resolve(process.env[key] ?? null),
      storage,
      workspaceDir: null,
      workspaceStorage: null,
      // No asset library here: outputs stay in storage, served by URL.
      persistOutputAssets: false
    });
    const session = await ExecutionSession.create({
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

  return { run, storage };
}
