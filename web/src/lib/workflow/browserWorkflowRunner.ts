/**
 * In-browser workflow execution for pure-browser sub-graphs.
 *
 * When a graph references only nodes that declare support for the `"browser"`
 * platform, we can run it client-side with the same kernel `WorkflowRunner`
 * the server uses — no round-trip — and feed the emitted `ProcessingMessage`s
 * into the very same client pipeline (`GlobalWebSocketManager.deliverLocal`)
 * that server-streamed messages flow through. The canvas, results, status and
 * log stores light up identically to a server run.
 *
 * `runBrowserGraphJob` mirrors {@link runInlineGraphJob}'s signature and result
 * shape, so callers can delegate to it transparently.
 *
 * The heavy runner + node packages are pulled in via a dynamic import so they
 * land in their own lazy chunk (only loaded the first time a browser sub-graph
 * actually runs) and stay out of unit-test bundles. Everything degrades
 * gracefully: if the runner can't be loaded, callers fall back to the server.
 */

import type { WorkflowGraph } from "../../stores/ApiTypes";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../websocket/GlobalWebSocketManager";
import { uuidv4 } from "../../stores/uuidv4";

type WorkflowRunnerModule = typeof import("@nodetool-ai/workflow-runner");

/** Graph in the kernel's `NodeDescriptor` shape (properties, not `data`). */
type KernelGraph = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

interface LoadedModules {
  wf: Pick<WorkflowRunnerModule, "createBrowserRegistry" | "runBrowserWorkflow">;
  nodeClasses: unknown[];
}

interface LoadedBrowserRunner {
  runBrowserWorkflow: WorkflowRunnerModule["runBrowserWorkflow"];
  registry: ReturnType<WorkflowRunnerModule["createBrowserRegistry"]>;
}

export interface BrowserGraphJobOptions {
  graph: WorkflowGraph;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  workflowId: string;
  /** Reuse a caller-supplied job id; one is generated otherwise. */
  jobId?: string;
}

/** Result shape shared with {@link runInlineGraphJob}. */
export interface BrowserGraphJobResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
}

/**
 * Test seam: replace the dynamic module loader. Resets the cached runner so the
 * next call re-loads through the override. Pass `null` to restore the default.
 */
export function __setBrowserRunnerLoader(
  loader: (() => Promise<LoadedModules | null>) | null
): void {
  loadModules = loader ?? defaultLoadModules;
  runnerPromise = null;
  cachedRunner = undefined;
}

function isTestEnv(): boolean {
  return (
    typeof process !== "undefined" &&
    !!(
      process.env?.JEST_WORKER_ID !== undefined ||
      process.env?.NODE_ENV === "test"
    )
  );
}

/** A class is a node executor if it exposes a static `nodeType` string. */
function collectNodeClasses(mod: Record<string, unknown>): unknown[] {
  return Object.values(mod).filter(
    (value) =>
      typeof value === "function" &&
      typeof (value as { nodeType?: unknown }).nodeType === "string"
  );
}

const defaultLoadModules = async (): Promise<LoadedModules | null> => {
  // Never pull the heavy runner / node packages into a unit-test process —
  // those tests inject a loader via __setBrowserRunnerLoader when they need it.
  if (isTestEnv()) return null;

  // Import the genuinely browser-portable node groups via core-nodes'
  // per-file subpaths. We deliberately avoid the package index (it re-exports
  // `vector` → sqlite-vec / better-sqlite3 native bindings) and `code-nodes`
  // (→ code-runners/Docker/ssh2, agents → keytar) — neither bundles for the
  // browser. `createBrowserRegistry` additionally filters by platform tag.
  const [
    wf,
    constant,
    control,
    input,
    list,
    compare,
    datetime,
    validate,
    placeholders,
    subgraph,
    workflow
  ] = await Promise.all([
    import("@nodetool-ai/workflow-runner"),
    import("@nodetool-ai/core-nodes/nodes/constant"),
    import("@nodetool-ai/core-nodes/nodes/control"),
    import("@nodetool-ai/core-nodes/nodes/input"),
    import("@nodetool-ai/core-nodes/nodes/list"),
    import("@nodetool-ai/core-nodes/nodes/compare"),
    import("@nodetool-ai/core-nodes/nodes/lib-datetime"),
    import("@nodetool-ai/core-nodes/nodes/lib-validate"),
    import("@nodetool-ai/core-nodes/nodes/extended-placeholders"),
    import("@nodetool-ai/core-nodes/nodes/subgraph"),
    import("@nodetool-ai/core-nodes/nodes/workflow")
  ]);

  const nodeClasses = [
    constant,
    control,
    input,
    list,
    compare,
    datetime,
    validate,
    placeholders,
    subgraph,
    workflow
  ].flatMap((mod) => collectNodeClasses(mod as Record<string, unknown>));

  return { wf, nodeClasses };
};

let loadModules: () => Promise<LoadedModules | null> = defaultLoadModules;
let runnerPromise: Promise<LoadedBrowserRunner | null> | null = null;
// Synchronously-readable snapshot of the load result: `undefined` until the
// first load settles, then the runner or `null` (unavailable).
let cachedRunner: LoadedBrowserRunner | null | undefined;

function loadBrowserRunner(): Promise<LoadedBrowserRunner | null> {
  if (!runnerPromise) {
    runnerPromise = (async () => {
      try {
        const mods = await loadModules();
        if (!mods) {
          cachedRunner = null;
          return null;
        }
        const registry = mods.wf.createBrowserRegistry(
          mods.nodeClasses as Parameters<
            WorkflowRunnerModule["createBrowserRegistry"]
          >[0]
        );
        cachedRunner = {
          runBrowserWorkflow: mods.wf.runBrowserWorkflow,
          registry
        };
        return cachedRunner;
      } catch (error) {
        console.warn(
          "[browserWorkflowRunner] browser execution unavailable; using server",
          error
        );
        // A thrown load is potentially transient (chunk/network hiccup). Re-arm
        // the loader so a later attempt — e.g. the next workflow open — can
        // retry, rather than disabling in-browser execution until a page
        // reload. Leaving `cachedRunner` undefined also lets the sync warm path
        // fire again. (A loader that *returns* null above is intentional and
        // stays cached.)
        runnerPromise = null;
        cachedRunner = undefined;
        return null;
      }
    })();
  }
  return runnerPromise;
}

/**
 * Warm the browser runner (registry + node classes) ahead of time so the first
 * eligible run executes client-side rather than falling back to the server
 * while the chunk loads. Fire-and-forget; safe to call repeatedly.
 */
export function preloadBrowserRunner(): void {
  void loadBrowserRunner();
}

/**
 * Synchronous routing decision used on hot paths. Returns `true` only when the
 * browser runner is already loaded and can run every node in `graph`. When the
 * runner hasn't loaded yet it returns `false` and warms the cache in the
 * background, so the decision adds no latency to the server path.
 */
export function canRunGraphInBrowserSync(
  graph: WorkflowGraph | null | undefined
): boolean {
  const nodes = graph?.nodes ?? [];
  if (nodes.length === 0) return false;
  if (cachedRunner === undefined) {
    preloadBrowserRunner();
    return false;
  }
  if (cachedRunner === null) return false;
  const runner = cachedRunner;
  return nodes.every(
    (node) => typeof node.type === "string" && runner.registry.has(node.type)
  );
}

/**
 * True iff every node in `graph` can run in the browser. Loads the browser
 * node registry on first use (cached); resolves `false` — never throws — when
 * the registry is unavailable, so callers safely fall back to the server.
 */
export async function canRunGraphInBrowser(
  graph: WorkflowGraph | null | undefined
): Promise<boolean> {
  const nodes = graph?.nodes ?? [];
  if (nodes.length === 0) return false;
  const runner = await loadBrowserRunner();
  if (!runner) return false;
  return nodes.every(
    (node) =>
      typeof node.type === "string" && runner.registry.has(node.type)
  );
}

/**
 * Map the web/Python graph serialization (node props under `data`, edge kind
 * under `type`) to the kernel's `NodeDescriptor` contract (`properties` /
 * `edge_type`). Mirrors the server's `normalizeGraph`.
 */
function normalizeGraphForKernel(graph: WorkflowGraph): KernelGraph {
  const nodes = (graph.nodes ?? []).map((raw) => {
    const node = raw as Record<string, unknown>;
    if (node.properties === undefined && node.data !== undefined) {
      const { data, ...rest } = node;
      return { ...rest, properties: data };
    }
    return node;
  });
  const edges = (graph.edges ?? []).map((raw) => {
    const edge = raw as Record<string, unknown>;
    const rawType = edge.edge_type ?? edge.type;
    const edge_type = rawType === "control" ? "control" : "data";
    const { type: _type, ...rest } = edge;
    return { ...rest, edge_type };
  });
  return { nodes, edges };
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Run a pure-browser sub-graph client-side. Streams every `ProcessingMessage`
 * through `GlobalWebSocketManager.deliverLocal` so the UI updates exactly as it
 * would for a server run, while collecting outputs into the returned result.
 */
export async function runBrowserGraphJob(
  options: BrowserGraphJobOptions
): Promise<BrowserGraphJobResult> {
  const { graph, params = {}, signal, workflowId } = options;
  if (signal?.aborted) {
    return { success: false, outputs: {}, error: "Aborted" };
  }

  const runner = await loadBrowserRunner();
  if (!runner) {
    return { success: false, outputs: {}, error: "Browser runner unavailable" };
  }

  const jobId = options.jobId ?? uuidv4();
  const outputs: Record<string, unknown> = {};
  let nodeError: string | undefined;

  const gen = runner.runBrowserWorkflow({
    graph: normalizeGraphForKernel(graph) as unknown as Parameters<
      LoadedBrowserRunner["runBrowserWorkflow"]
    >[0]["graph"],
    registry: runner.registry,
    params,
    jobId,
    workflowId,
    signal
  });

  try {
    while (true) {
      const next = await gen.next();
      if (next.done) {
        const result = next.value;
        if (result.status === "failed") {
          return {
            success: false,
            outputs,
            error: result.error ?? nodeError ?? "Workflow failed"
          };
        }
        if (result.status === "cancelled") {
          return { success: false, outputs, error: "Cancelled" };
        }
        return { success: true, outputs };
      }

      const message = next.value as unknown as WebSocketMessage;
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
    return {
      success: false,
      outputs,
      error: error instanceof Error ? error.message : "Browser execution failed"
    };
  }
}
