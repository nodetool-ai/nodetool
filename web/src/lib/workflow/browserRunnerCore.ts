/**
 * Shared in-browser runner internals used by both the Web Worker
 * (`browserRunner.worker.ts`, the production execution context) and the
 * main-thread fallback (`browserWorkflowRunner.ts`, used in tests and when a
 * worker is unavailable).
 *
 * Pure module: no `Worker`, no `import.meta`, no DOM. The heavy node/runner
 * packages are pulled in via dynamic `import()` inside {@link loadBrowserModules}
 * so they land in a lazy chunk and stay out of unit-test bundles (the functions
 * here are referenced but not executed under jest).
 */

import type { WorkflowGraph } from "../../stores/ApiTypes";
import { Buffer } from "buffer";

const browserGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};
if (typeof browserGlobal.Buffer === "undefined") {
  browserGlobal.Buffer = Buffer;
}

// Narrow `/browser` subpath (not the package index) so neither the worker nor
// the main bundle pulls `handler.js` → providers/tracing (@opentelemetry /
// @grpc) — only `createBrowserRegistry` + `runBrowserWorkflow` are needed here.
type WorkflowRunnerModule =
  typeof import("@nodetool-ai/workflow-runner/browser");

/** Graph in the kernel's `NodeDescriptor` shape (properties, not `data`). */
type KernelGraph = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

/** Read GPU-texture ImageRefs back to CPU buffers at a serialize boundary. */
export type ResolveImageRefForTransport = (value: unknown) => Promise<unknown>;
/** Free every GPU texture a run created (run-scoped lifecycle). */
export type ReleaseRunTextures = (runId: string) => void;

export interface LoadedModules {
  wf: Pick<WorkflowRunnerModule, "createBrowserRegistry" | "runBrowserWorkflow">;
  nodeClasses: unknown[];
  /** image-nodes' GPU-texture boundary helpers (absent in the test loader). */
  resolveImageRefForTransport?: ResolveImageRefForTransport;
  releaseRunTextures?: ReleaseRunTextures;
}

export interface LoadedBrowserRunner {
  runBrowserWorkflow: WorkflowRunnerModule["runBrowserWorkflow"];
  registry: ReturnType<WorkflowRunnerModule["createBrowserRegistry"]>;
  /** Node types the registry can run client-side (browser platform). */
  browserNodeTypes: string[];
  /**
   * Browser-capable node types that require a WebGPU device (`requiresGpu`).
   * When `navigator.gpu` is unavailable, the runner drops these from the
   * browser-capable set so any graph using them routes to the server (where a
   * GPU is always present via Dawn) instead of failing the run.
   */
  gpuNodeTypes: Set<string>;
  /** GPU-texture boundary resolve (browser GPU runs only). */
  resolveImageRefForTransport?: ResolveImageRefForTransport;
  /** Free the run's GPU textures (browser GPU runs only). */
  releaseRunTextures?: ReleaseRunTextures;
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

/** A class is a node executor if it exposes a static `nodeType` string. */
function isNodeClass(value: unknown): boolean {
  return (
    typeof value === "function" &&
    typeof (value as { nodeType?: unknown }).nodeType === "string"
  );
}

/**
 * Collect node classes from a module. They may be exported individually
 * (core-nodes: `export class FooNode`) or only inside an array constant
 * (image-nodes: `export const LIB_IMAGE_*_NODES = tagAsHybrid([...])`, whose
 * classes are built dynamically and never named-exported), so harvest both
 * shapes. A Set dedupes the overlap when a module exports both the classes and
 * an array that contains them.
 */
export function collectNodeClasses(mod: Record<string, unknown>): unknown[] {
  const classes = new Set<unknown>();
  for (const value of Object.values(mod)) {
    if (isNodeClass(value)) {
      classes.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNodeClass(item)) {
          classes.add(item);
        }
      }
    }
  }
  return [...classes];
}

/**
 * The browser-portable node groups, imported via per-file subpaths.
 * We deliberately avoid the package indexes (core-nodes re-exports `vector` →
 * sqlite-vec / better-sqlite3 native bindings; `code-nodes` → code-runners /
 * Docker / ssh2) — neither bundles for the browser. The image node groups run
 * their pixel pass on `navigator.gpu` (OffscreenCanvas codec) and load `sharp`
 * lazily, so they bundle cleanly; `createBrowserRegistry` filters by platform
 * tag (e.g. image.ts's Load/Save/AI nodes are tagged server and dropped).
 */
const NODE_MODULE_GROUPS: ReadonlyArray<
  readonly [name: string, load: () => Promise<unknown>]
> = [
  ["constant", () => import("@nodetool-ai/core-nodes/nodes/constant")],
  ["control", () => import("@nodetool-ai/core-nodes/nodes/control")],
  ["input", () => import("@nodetool-ai/core-nodes/nodes/input")],
  ["list", () => import("@nodetool-ai/core-nodes/nodes/list")],
  ["compare", () => import("@nodetool-ai/core-nodes/nodes/compare")],
  ["fake-media", () => import("@nodetool-ai/core-nodes/nodes/fake-media")],
  ["lib-datetime", () => import("@nodetool-ai/core-nodes/nodes/lib-datetime")],
  ["lib-validate", () => import("@nodetool-ai/core-nodes/nodes/lib-validate")],
  [
    "extended-placeholders",
    () => import("@nodetool-ai/core-nodes/nodes/extended-placeholders")
  ],
  ["subgraph", () => import("@nodetool-ai/core-nodes/nodes/subgraph")],
  ["workflow", () => import("@nodetool-ai/core-nodes/nodes/workflow")],
  // The universal Code node (nodetool.code.Code) runs vanilla JS in a QuickJS
  // WebAssembly sandbox — no Node `vm`, no subprocess — so it runs client-side.
  // Imported via its own subpath (not the code-nodes index, which pulls
  // code-runners → Docker/ssh2). The sandbox pulls memfs, which needs the real
  // stream classes from vite's stream-stub (readable-stream) to evaluate.
  ["code-node", () => import("@nodetool-ai/code-nodes/nodes/code-node")],
  [
    "lib-image-color-grading",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-color-grading")
  ],
  [
    "lib-image-color",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-color")
  ],
  [
    "lib-image-effects",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-effects")
  ],
  [
    "lib-image-generators",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-generators")
  ],
  [
    "lib-image-keyer",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-keyer")
  ],
  [
    "lib-image-mask",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-mask")
  ],
  [
    "lib-image-warp",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-warp")
  ],
  [
    "lib-image-channel",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-channel")
  ],
  [
    "lib-image-filter-extras",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-filter-extras")
  ],
  // filter/enhance/draw mix GPU nodes (browser) with sharp/CPU gap nodes
  // (Canny, histogram enhances, RenderText/Mask) tagged server.
  [
    "lib-image-filter",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-filter")
  ],
  [
    "lib-image-enhance",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-enhance")
  ],
  [
    "lib-image-draw",
    () => import("@nodetool-ai/image-nodes/nodes/lib-image-draw")
  ],
  // image.ts mixes GPU transform nodes (browser) with node-only Load/Save/AI
  // nodes; the latter are tagged server, so createBrowserRegistry keeps only
  // the transforms. It's sharp-free (lazy) and de-barreled, so it bundles.
  ["image", () => import("@nodetool-ai/image-nodes/nodes/image")],
  // Preview is a pure pass-through that renders any value; its own browser-safe
  // module (no audio-codec deps) lets pass-through graphs ending in a Preview
  // run client-side instead of forcing a server round-trip.
  ["preview", () => import("@nodetool-ai/audio-nodes/nodes/preview")],
  // audio.ts mixes pure sample/byte transforms (hybrid) with node-only
  // Load/Save/TTS nodes tagged server; dsp/effects route WebAudio through
  // lib/audio-context.ts (global OfflineAudioContext or pure-JS biquad
  // fallback) and hide node-web-audio-api / rubberband behind importHidden,
  // so all four modules bundle cleanly.
  ["audio", () => import("@nodetool-ai/audio-nodes/nodes/audio")],
  ["lib-audio-dsp", () => import("@nodetool-ai/audio-nodes/nodes/lib-audio-dsp")],
  [
    "lib-audio-effects",
    () => import("@nodetool-ai/audio-nodes/nodes/lib-audio-effects")
  ],
  [
    "realtime-audio",
    () => import("@nodetool-ai/audio-nodes/nodes/realtime-audio")
  ],
  ["synthesis", () => import("@nodetool-ai/audio-nodes/nodes/synthesis")]
];

/**
 * Import a lazy chunk, tolerating failure. A failed `import()` normally
 * rejects, but on the main thread the app's `vite:preloadError` listener
 * (`preloadErrorReload.ts`) suppresses Vite's rethrow, in which case the
 * import resolves `undefined` instead — treat both as "not available",
 * keeping the failure for the caller's diagnostics.
 */
async function importOptional(
  load: () => Promise<unknown>
): Promise<{ mod: unknown; error: unknown }> {
  try {
    const mod = (await load()) ?? null;
    return {
      mod,
      error: mod
        ? null
        : new Error("import resolved empty (chunk preload failure suppressed)")
    };
  } catch (error) {
    return { mod: null, error };
  }
}

export async function loadBrowserModules(): Promise<LoadedModules> {
  // The runner module is required — without it there is no browser runner and
  // the caller falls back to the server path.
  const wfImport = await importOptional(
    () => import("@nodetool-ai/workflow-runner/browser")
  );
  const wf = wfImport.mod as WorkflowRunnerModule | null;
  if (!wf) {
    throw new Error(
      `workflow-runner browser module failed to load: ${String(wfImport.error)}`
    );
  }

  // Node groups are independent: one group failing to load or evaluate in this
  // context (a dep that can't run in the browser, a blocked chunk) must not
  // take down the whole registry. Skip it — its node types then report as not
  // browser-capable and route to the server.
  const loaded = await Promise.all(
    NODE_MODULE_GROUPS.map(
      async ([name, load]) => [name, await importOptional(load)] as const
    )
  );

  const nodeClasses: unknown[] = [];
  const perGroup: Record<string, number> = {};
  let failedGroups = 0;
  for (const [name, { mod, error }] of loaded) {
    if (!mod) {
      failedGroups += 1;
      console.warn(
        `[browserRunner] node group "${name}" failed to load — ` +
          "its nodes will run on the server",
        error
      );
      continue;
    }
    const classes = collectNodeClasses(mod as Record<string, unknown>);
    perGroup[name] = classes.length;
    nodeClasses.push(...classes);
  }
  console.info(
    `[browserRunner] loaded ${nodeClasses.length} node class(es) from ` +
      `${loaded.length - failedGroups}/${loaded.length} group(s)`,
    perGroup
  );

  // The GPU-texture boundary helpers — read-back at serialize points + run-end
  // texture cleanup. Loaded here so they ride the same lazy chunk as the nodes.
  // Optional: without them, GPU-node runs lose texture read-back/cleanup, but
  // those nodes only register when the image groups above loaded.
  const [imageIoImport, gpuDeviceImport] = await Promise.all([
    importOptional(() => import("@nodetool-ai/image-nodes/nodes/image-io")),
    importOptional(() => import("@nodetool-ai/image-nodes/nodes/gpu-device"))
  ]);
  for (const [name, { mod, error }] of [
    ["image-io", imageIoImport],
    ["gpu-device", gpuDeviceImport]
  ] as const) {
    if (!mod) {
      console.warn(`[browserRunner] GPU helper "${name}" failed to load`, error);
    }
  }
  const imageIo = imageIoImport.mod as
    | typeof import("@nodetool-ai/image-nodes/nodes/image-io")
    | null;
  const gpuDevice = gpuDeviceImport.mod as
    | typeof import("@nodetool-ai/image-nodes/nodes/gpu-device")
    | null;

  return {
    wf,
    nodeClasses,
    resolveImageRefForTransport: imageIo?.resolveImageRefForTransport,
    releaseRunTextures: gpuDevice?.releaseRunTextures
  };
}

/**
 * Build a browser `NodeRegistry` from loaded modules and report which node
 * types survived the platform filter (the source of truth for routing).
 */
export function buildBrowserRunner(mods: LoadedModules): LoadedBrowserRunner {
  const registry = mods.wf.createBrowserRegistry(
    mods.nodeClasses as Parameters<
      WorkflowRunnerModule["createBrowserRegistry"]
    >[0]
  );
  const candidates = (mods.nodeClasses as Array<{ nodeType?: unknown }>)
    .map((c) => c.nodeType)
    .filter((t): t is string => typeof t === "string");
  const browserNodeTypes = candidates.filter((t) => registry.has(t));
  const filteredOut = candidates.filter((t) => !registry.has(t));
  // Browser-capable types that need a WebGPU device (tagged via tagAsBrowserGpu).
  const gpuNodeTypes = new Set(
    (mods.nodeClasses as Array<{ nodeType?: unknown; requiresGpu?: unknown }>)
      .filter(
        (c) =>
          c.requiresGpu === true &&
          typeof c.nodeType === "string" &&
          registry.has(c.nodeType)
      )
      .map((c) => c.nodeType as string)
  );
  console.info(
    `[browserRunner] registry ready — ${browserNodeTypes.length}/${candidates.length} loaded node type(s) are browser-capable`,
    {
      registered: browserNodeTypes,
      filteredOutByPlatform: filteredOut,
      requireWebGpu: [...gpuNodeTypes]
    }
  );
  return {
    runBrowserWorkflow: mods.wf.runBrowserWorkflow,
    registry,
    browserNodeTypes,
    gpuNodeTypes,
    resolveImageRefForTransport: mods.resolveImageRefForTransport,
    releaseRunTextures: mods.releaseRunTextures
  };
}

/**
 * Pure: drop the GPU-requiring node types from `browserNodeTypes` when no
 * WebGPU device is available. Graphs using them then route to the server.
 */
export function applyGpuCapability(
  browserNodeTypes: string[],
  gpuNodeTypes: ReadonlySet<string>,
  gpuAvailable: boolean
): string[] {
  if (gpuAvailable || gpuNodeTypes.size === 0) return browserNodeTypes;
  return browserNodeTypes.filter((t) => !gpuNodeTypes.has(t));
}

let gpuProbe: Promise<boolean> | null = null;

/**
 * Probe whether a usable WebGPU device is available in the current execution
 * context (Web Worker or main thread). Cached for the context's lifetime.
 * Resolves `false` when `navigator.gpu` is absent or no adapter can be
 * acquired — the exact CI / locked-down-browser case the server fallback
 * targets. Worker-safe: `navigator` exists in workers and is read off
 * `globalThis` so this module stays DOM-free at type level.
 */
export function probeBrowserGpu(): Promise<boolean> {
  if (!gpuProbe) {
    gpuProbe = (async () => {
      const nav = (
        globalThis as {
          navigator?: { gpu?: { requestAdapter(): Promise<unknown> } };
        }
      ).navigator;
      const gpu = nav?.gpu;
      if (!gpu) return false;
      try {
        return (await gpu.requestAdapter()) != null;
      } catch {
        return false;
      }
    })();
  }
  return gpuProbe;
}

/**
 * The runner's browser-capable node types after applying the WebGPU capability
 * probe: identical to `browserNodeTypes` when a GPU is present (or the graph
 * uses no GPU nodes), with the GPU-requiring types removed otherwise.
 */
export async function capabilityFilteredBrowserNodeTypes(
  runner: LoadedBrowserRunner
): Promise<string[]> {
  const gpuAvailable =
    runner.gpuNodeTypes.size === 0 ? true : await probeBrowserGpu();
  return applyGpuCapability(
    runner.browserNodeTypes,
    runner.gpuNodeTypes,
    gpuAvailable
  );
}

/**
 * Map the web/Python graph serialization (node props under `data`, edge kind
 * under `type`) to the kernel's `NodeDescriptor` contract (`properties` /
 * `edge_type`). Mirrors the server's `normalizeGraph`.
 */
export function normalizeGraphForKernel(graph: WorkflowGraph): KernelGraph {
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
