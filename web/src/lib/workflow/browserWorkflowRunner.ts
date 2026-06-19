/**
 * In-browser workflow execution for pure-browser sub-graphs.
 *
 * When a graph references only nodes that declare support for the `"browser"`
 * platform, we run it client-side with the same kernel `WorkflowRunner` the
 * server uses — no round-trip — and feed the emitted `ProcessingMessage`s into
 * the very same client pipeline (`GlobalWebSocketManager.deliverLocal`) that
 * server-streamed messages flow through. The canvas, results, status and log
 * stores light up identically to a server run.
 *
 * Execution runs in a **Web Worker** (`browserRunner.worker.ts`) so the kernel,
 * GPU orchestration and CPU-fallback nodes never block the editor. This module
 * is the dispatcher: it routes to the worker in real browsers and to an
 * in-process main-thread fallback under jest / when workers are unavailable.
 * Both paths share `browserRunnerCore.ts` and degrade to the server gracefully.
 *
 * `runBrowserGraphJob` mirrors {@link runInlineGraphJob}'s signature and result
 * shape, so callers can delegate to it transparently.
 */

import type { WorkflowGraph } from "../../stores/ApiTypes";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../websocket/GlobalWebSocketManager";
import { v4 as uuidv4 } from "uuid";
import { materializeBrowserOutputs } from "./materializeBrowserOutputs";
import {
  buildBrowserRunner,
  collectNodeClasses,
  loadBrowserModules,
  normalizeGraphForKernel,
  probeBrowserGpu,
  type BrowserGraphJobOptions,
  type BrowserGraphJobResult,
  type LoadedBrowserRunner,
  type LoadedModules
} from "./browserRunnerCore";

export { collectNodeClasses };
export type { BrowserGraphJobOptions, BrowserGraphJobResult };

function isTestEnv(): boolean {
  return (
    typeof process !== "undefined" &&
    !!(
      process.env?.JEST_WORKER_ID !== undefined ||
      process.env?.NODE_ENV === "test"
    )
  );
}

/**
 * Use the Web Worker path in real browsers only. Under jest (jsdom) we run the
 * main-thread fallback so the loader seam (`__setBrowserRunnerLoader`) and the
 * existing unit tests keep working without spawning a real worker.
 */
function shouldUseWorker(): boolean {
  return !isTestEnv() && typeof Worker !== "undefined";
}

// Set once the worker init fails — pins all later calls to the main-thread path
// for the session rather than re-paying a failing spawn.
let workerDisabled = false;

// Synchronously-readable snapshot of the browser-capable node types, populated
// by whichever path loads first: `undefined` until known, then the set or
// `null` (no runner available).
let cachedBrowserNodeTypes: Set<string> | null | undefined;

// -----------------------------------------------------------------------------
// Main-thread fallback (also the unit-test path)
// -----------------------------------------------------------------------------

/**
 * Test seam: replace the dynamic module loader for the main-thread path. Resets
 * the cached runner so the next call re-loads through the override. Pass `null`
 * to restore the default.
 */
export function __setBrowserRunnerLoader(
  loader: (() => Promise<LoadedModules | null>) | null
): void {
  loadModules = loader ?? defaultLoadModules;
  localRunnerPromise = null;
  cachedLocalRunner = undefined;
  localGpuAvailable = undefined;
  cachedBrowserNodeTypes = undefined;
  workerDisabled = false;
}

const defaultLoadModules = async (): Promise<LoadedModules | null> => {
  // Never pull the heavy runner / node packages into a unit-test process — those
  // tests inject a loader via __setBrowserRunnerLoader when they need one.
  if (isTestEnv()) return null;
  return loadBrowserModules();
};

let loadModules: () => Promise<LoadedModules | null> = defaultLoadModules;
let localRunnerPromise: Promise<LoadedBrowserRunner | null> | null = null;
let cachedLocalRunner: LoadedBrowserRunner | null | undefined;
// Whether this (main) thread has a usable WebGPU device. Resolved alongside the
// runner so `browserSupportsSync` can gate GPU node types without going async.
// Stays `undefined` until the probe completes (set before `cachedLocalRunner`).
let localGpuAvailable: boolean | undefined;

function loadLocalRunner(): Promise<LoadedBrowserRunner | null> {
  if (!localRunnerPromise) {
    localRunnerPromise = (async () => {
      try {
        const mods = await loadModules();
        if (!mods) {
          cachedLocalRunner = null;
          return null;
        }
        const runner = buildBrowserRunner(mods);
        // Resolve GPU availability before the runner is observable, so the
        // routing gate in browserSupportsSync sees a settled value.
        localGpuAvailable =
          runner.gpuNodeTypes.size === 0 ? true : await probeBrowserGpu();
        cachedLocalRunner = runner;
        return runner;
      } catch (error) {
        console.warn(
          "[browserRunner] main-thread runner unavailable; using server",
          error
        );
        // A thrown load is potentially transient (chunk/network hiccup); re-arm
        // so a later attempt can retry rather than disabling browser execution
        // until a page reload.
        localRunnerPromise = null;
        cachedLocalRunner = undefined;
        return null;
      }
    })();
  }
  return localRunnerPromise;
}

// -----------------------------------------------------------------------------
// Routing decision (shared by both paths)
// -----------------------------------------------------------------------------

/** Whether the active path is the worker (vs the main-thread fallback). */
function usingWorker(): boolean {
  return shouldUseWorker() && !workerDisabled;
}

/**
 * Ensure the active path's runner is loaded. The worker reports its capable
 * node types across the boundary (a registry can't be serialized); the
 * main-thread path keeps a live registry. Never throws; resolves `false` when
 * no runner is available so callers fall back to the server.
 */
async function ensureRunnerLoaded(): Promise<boolean> {
  if (usingWorker()) {
    try {
      const { getBrowserWorkerReady } = await import("./browserWorkerClient");
      cachedBrowserNodeTypes = await getBrowserWorkerReady();
      return true;
    } catch (error) {
      console.warn(
        "[browserRunner] worker unavailable; using main-thread fallback",
        error
      );
      workerDisabled = true;
    }
  }
  return (await loadLocalRunner()) != null;
}

/**
 * Sync support check against the active path: `true`/`false` when the runner is
 * loaded, `undefined` when it isn't yet. Worker → serialized type set;
 * main-thread → the live registry.
 */
export function browserSupportsSync(type: string): boolean | undefined {
  if (usingWorker()) {
    // The worker already withheld GPU types from its reported set when no
    // WebGPU device was available, so this needs no extra gate.
    if (cachedBrowserNodeTypes === undefined) return undefined;
    return cachedBrowserNodeTypes?.has(type) ?? false;
  }
  if (cachedLocalRunner === undefined) return undefined;
  if (!cachedLocalRunner) return false;
  // No GPU here → GPU shader nodes can't run client-side; force them to the
  // server (which has Dawn) by reporting them as unsupported.
  if (localGpuAvailable === false && cachedLocalRunner.gpuNodeTypes.has(type)) {
    return false;
  }
  return cachedLocalRunner.registry.has(type);
}

/**
 * Warm the browser runner ahead of time so the first eligible run executes
 * client-side rather than falling back to the server while it loads.
 * Fire-and-forget; safe to call repeatedly.
 */
export function preloadBrowserRunner(): void {
  void ensureRunnerLoaded();
}

/**
 * Synchronous routing decision used on hot paths. Returns `true` only when the
 * runner is already loaded and can run every node in `graph`. When it hasn't
 * loaded yet it returns `false` and warms the cache in the background, so the
 * decision adds no latency to the server path.
 */
export function canRunGraphInBrowserSync(
  graph: WorkflowGraph | null | undefined
): boolean {
  const nodes = graph?.nodes ?? [];
  if (nodes.length === 0) return false;
  const ready = usingWorker()
    ? cachedBrowserNodeTypes !== undefined
    : cachedLocalRunner !== undefined;
  if (!ready) {
    preloadBrowserRunner();
    return false;
  }
  return nodes.every(
    (node) =>
      typeof node.type === "string" && browserSupportsSync(node.type) === true
  );
}

/**
 * True iff every node in `graph` can run in the browser. Loads the browser node
 * registry on first use (cached); resolves `false` — never throws — when no
 * runner is available, so callers safely fall back to the server.
 */
export async function canRunGraphInBrowser(
  graph: WorkflowGraph | null | undefined
): Promise<boolean> {
  return (await reportBrowserEligibility(graph)).eligible;
}

/** Diagnostic breakdown of why a graph will (or won't) run in the browser. */
export interface BrowserEligibility {
  /** Every node is browser-capable and a runner is loaded. */
  eligible: boolean;
  /** A browser runner (worker or main-thread) loaded successfully. */
  runnerAvailable: boolean;
  /** Total node types in the graph. */
  total: number;
  /** Node types found in the browser registry. */
  browserNodeTypes: string[];
  /** Node types NOT in the browser registry — these force the server path. */
  serverNodeTypes: string[];
}

/**
 * Explain the browser-vs-server routing decision for `graph`. Loads the browser
 * registry (cached) and partitions the graph's node types into those that can
 * run client-side and those that can't. Used by the runner to log *why* a run
 * falls back to the server. Never throws.
 */
export async function reportBrowserEligibility(
  graph: WorkflowGraph | null | undefined
): Promise<BrowserEligibility> {
  const types = (graph?.nodes ?? [])
    .map((node) => node.type)
    .filter((t): t is string => typeof t === "string");
  const available = await ensureRunnerLoaded();
  if (!available) {
    return {
      eligible: false,
      runnerAvailable: false,
      total: types.length,
      browserNodeTypes: [],
      serverNodeTypes: types
    };
  }
  const browserNodeTypes: string[] = [];
  const serverNodeTypes: string[] = [];
  for (const type of types) {
    (browserSupportsSync(type) === true ? browserNodeTypes : serverNodeTypes).push(
      type
    );
  }
  return {
    eligible: types.length > 0 && serverNodeTypes.length === 0,
    runnerAvailable: true,
    total: types.length,
    browserNodeTypes,
    serverNodeTypes
  };
}

// -----------------------------------------------------------------------------
// Execution
// -----------------------------------------------------------------------------

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Run a pure-browser sub-graph client-side. Uses the Web Worker in real
 * browsers; falls back to the main thread under jest / when a worker can't
 * start. Streams every `ProcessingMessage` through
 * `GlobalWebSocketManager.deliverLocal` so the UI updates exactly as it would
 * for a server run.
 */
/** Live runners of main-thread (fallback) jobs, keyed by job id. */
const localRunners = new Map<
  string,
  {
    updateNodeProperties: (
      nodeId: string,
      props: Record<string, unknown>
    ) => boolean;
  }
>();

/**
 * Push live property updates into a running browser job's node instances
 * (e.g. turning a synth knob while a patch plays). Routes to the worker when
 * worker runs are active, and to the main-thread runner otherwise.
 * Fire-and-forget; a no-op when the job isn't running.
 */
export function updateBrowserJobNodeProperties(
  jobId: string,
  nodeId: string,
  properties: Record<string, unknown>
): void {
  const local = localRunners.get(jobId);
  if (local) {
    local.updateNodeProperties(nodeId, properties);
    return;
  }
  if (shouldUseWorker() && !workerDisabled) {
    void import("./browserWorkerClient")
      .then((m) => m.updateBrowserJobNodeProperties(jobId, nodeId, properties))
      .catch(() => undefined);
  }
}

export async function runBrowserGraphJob(
  options: BrowserGraphJobOptions
): Promise<BrowserGraphJobResult> {
  if (shouldUseWorker() && !workerDisabled) {
    try {
      const { getBrowserWorkerReady, runBrowserGraphJobInWorker } =
        await import("./browserWorkerClient");
      // Ensure the registry is built; a failed init throws → main-thread path.
      await getBrowserWorkerReady();
      return await runBrowserGraphJobInWorker(options);
    } catch (error) {
      console.warn(
        "[browserRunner] worker run failed to start; falling back to main thread",
        error
      );
      workerDisabled = true;
    }
  }
  return runBrowserGraphJobLocal(options);
}

/**
 * In-process execution: runs the kernel on the main thread, materializing and
 * delivering each message inline. The fallback path and the unit-test path.
 */
async function runBrowserGraphJobLocal(
  options: BrowserGraphJobOptions
): Promise<BrowserGraphJobResult> {
  const { graph, params = {}, signal, workflowId } = options;
  if (signal?.aborted) {
    return { success: false, outputs: {}, error: "Aborted" };
  }

  const runner = await loadLocalRunner();
  if (!runner) {
    return { success: false, outputs: {}, error: "Browser runner unavailable" };
  }

  const jobId = options.jobId ?? uuidv4();
  const outputs: Record<string, unknown> = {};
  let nodeError: string | undefined;

  const nodeTypes = (graph.nodes ?? [])
    .map((n) => (n as { type?: string }).type)
    .filter((t): t is string => typeof t === "string");
  const startedAt = performance.now();
  const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;
  console.info(
    `[browserRunner] ▶ running ${nodeTypes.length} node(s) on main thread ` +
      `(job ${jobId}): ${nodeTypes.join(", ")}`
  );

  const gen = runner.runBrowserWorkflow({
    graph: normalizeGraphForKernel(graph) as unknown as Parameters<
      LoadedBrowserRunner["runBrowserWorkflow"]
    >[0]["graph"],
    registry: runner.registry,
    params,
    jobId,
    workflowId,
    signal,
    onRunner: (workflowRunner) => {
      localRunners.set(jobId, workflowRunner);
    }
  });

  try {
    while (true) {
      const next = await gen.next();
      if (next.done) {
        const result = next.value;
        if (result.status === "failed") {
          const error = result.error ?? nodeError ?? "Workflow failed";
          console.error(
            `[browserRunner] ✖ failed in ${elapsed()} (job ${jobId}): ${error}`
          );
          return { success: false, outputs, error };
        }
        if (result.status === "cancelled") {
          console.warn(
            `[browserRunner] ■ cancelled in ${elapsed()} (job ${jobId})`
          );
          return { success: false, outputs, error: "Cancelled" };
        }
        console.info(
          `[browserRunner] ✔ completed ${nodeTypes.length} node(s) ` +
            `in ${elapsed()} (job ${jobId})`
        );
        return { success: true, outputs };
      }

      const message = next.value as unknown as WebSocketMessage;

      // Resolve in-flight GPU-texture refs to a CPU buffer (read-back), then
      // normalize the same way the unified server does (raw-RGBA → PNG, inline
      // bytes → uri) so content cards / Preview / generations render identically.
      const mutable = message as Record<string, unknown>;
      const resolve = runner.resolveImageRefForTransport;
      if (message.type === "node_update" && mutable.result != null) {
        if (resolve) mutable.result = await resolve(mutable.result);
        mutable.result = materializeBrowserOutputs(mutable.result);
      } else if (message.type === "output_update" && mutable.value != null) {
        if (resolve) mutable.value = await resolve(mutable.value);
        mutable.value = materializeBrowserOutputs(mutable.value);
      }

      globalWebSocketManager.deliverLocal(message);

      const type = asString(message.type);
      if (type === "node_update") {
        const status = asString(message.status);
        const nodeId = asString(message.node_id);
        if (status === "completed" && nodeId && message.result != null) {
          outputs[nodeId] = message.result;
        } else if (status === "error") {
          nodeError = asString(message.error) ?? "Node error";
        }
      } else if (type === "job_update") {
        const resultField = message.result;
        if (
          resultField != null &&
          typeof resultField === "object" &&
          "outputs" in resultField &&
          (resultField as { outputs?: unknown }).outputs != null &&
          typeof (resultField as { outputs?: unknown }).outputs === "object"
        ) {
          Object.assign(
            outputs,
            (resultField as { outputs: Record<string, unknown> }).outputs
          );
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Browser execution failed";
    console.error(
      `[browserRunner] ✖ threw in ${elapsed()} (job ${jobId}): ${message}`
    );
    return { success: false, outputs, error: message };
  } finally {
    // Free every GPU texture this main-thread run created (run-scoped lifecycle).
    runner.releaseRunTextures?.(jobId);
    localRunners.delete(jobId);
  }
}
