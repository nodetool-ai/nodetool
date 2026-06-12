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

// Narrow `/browser` subpath (not the package index) so neither the worker nor
// the main bundle pulls `handler.js` → providers/tracing (@opentelemetry /
// @grpc) — only `createBrowserRegistry` + `runBrowserWorkflow` are needed here.
export type WorkflowRunnerModule =
  typeof import("@nodetool-ai/workflow-runner/browser");

/** Graph in the kernel's `NodeDescriptor` shape (properties, not `data`). */
export type KernelGraph = {
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

interface NodeClass {
  nodeType: string;
  (...args: unknown[]): unknown;
}

/** A class is a node executor if it exposes a static `nodeType` string. */
function isNodeClass(value: unknown): value is NodeClass {
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
 * Import the genuinely browser-portable node groups via per-file subpaths.
 * We deliberately avoid the package indexes (core-nodes re-exports `vector` →
 * sqlite-vec / better-sqlite3 native bindings; `code-nodes` → code-runners /
 * Docker / ssh2) — neither bundles for the browser. The image node groups run
 * their pixel pass on `navigator.gpu` (OffscreenCanvas codec) and load `sharp`
 * lazily, so they bundle cleanly; `createBrowserRegistry` filters by platform
 * tag (e.g. image.ts's Load/Save/AI nodes are tagged server and dropped).
 */
export async function loadBrowserModules(): Promise<LoadedModules> {
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
    workflow,
    imageColorGrading,
    imageColor,
    imageEffects,
    imageGenerators,
    imageKeyer,
    imageMask,
    imageWarp,
    imageChannel,
    imageFilterExtras,
    imageFilter,
    imageEnhance,
    imageDraw,
    imageCore,
    audioPreview,
    audioCore,
    audioDsp,
    audioEffects,
    audioRealtime,
    audioSynthesis
  ] = await Promise.all([
    import("@nodetool-ai/workflow-runner/browser"),
    import("@nodetool-ai/core-nodes/nodes/constant"),
    import("@nodetool-ai/core-nodes/nodes/control"),
    import("@nodetool-ai/core-nodes/nodes/input"),
    import("@nodetool-ai/core-nodes/nodes/list"),
    import("@nodetool-ai/core-nodes/nodes/compare"),
    import("@nodetool-ai/core-nodes/nodes/lib-datetime"),
    import("@nodetool-ai/core-nodes/nodes/lib-validate"),
    import("@nodetool-ai/core-nodes/nodes/extended-placeholders"),
    import("@nodetool-ai/core-nodes/nodes/subgraph"),
    import("@nodetool-ai/core-nodes/nodes/workflow"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-color-grading"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-color"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-effects"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-generators"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-keyer"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-mask"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-warp"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-channel"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-filter-extras"),
    // filter/enhance/draw mix GPU nodes (browser) with sharp/CPU gap nodes
    // (Canny, histogram enhances, RenderText/Mask) tagged server.
    import("@nodetool-ai/image-nodes/nodes/lib-image-filter"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-enhance"),
    import("@nodetool-ai/image-nodes/nodes/lib-image-draw"),
    // image.ts mixes GPU transform nodes (browser) with node-only Load/Save/AI
    // nodes; the latter are tagged server, so createBrowserRegistry keeps only
    // the transforms. It's sharp-free (lazy) and de-barreled, so it bundles.
    import("@nodetool-ai/image-nodes/nodes/image"),
    // Preview is a pure pass-through that renders any value; its own browser-safe
    // module (no audio-codec deps) lets pass-through graphs ending in a Preview
    // run client-side instead of forcing a server round-trip.
    import("@nodetool-ai/audio-nodes/nodes/preview"),
    // audio.ts mixes pure sample/byte transforms (hybrid) with node-only
    // Load/Save/TTS nodes tagged server; dsp/effects route WebAudio through
    // lib/audio-context.ts (global OfflineAudioContext or pure-JS biquad
    // fallback) and hide node-web-audio-api / rubberband behind importHidden,
    // so all four modules bundle cleanly.
    import("@nodetool-ai/audio-nodes/nodes/audio"),
    import("@nodetool-ai/audio-nodes/nodes/lib-audio-dsp"),
    import("@nodetool-ai/audio-nodes/nodes/lib-audio-effects"),
    import("@nodetool-ai/audio-nodes/nodes/realtime-audio"),
    import("@nodetool-ai/audio-nodes/nodes/synthesis")
  ]);

  const groups: Array<[string, unknown]> = [
    ["constant", constant],
    ["control", control],
    ["input", input],
    ["list", list],
    ["compare", compare],
    ["lib-datetime", datetime],
    ["lib-validate", validate],
    ["extended-placeholders", placeholders],
    ["subgraph", subgraph],
    ["workflow", workflow],
    ["lib-image-color-grading", imageColorGrading],
    ["lib-image-color", imageColor],
    ["lib-image-effects", imageEffects],
    ["lib-image-generators", imageGenerators],
    ["lib-image-keyer", imageKeyer],
    ["lib-image-mask", imageMask],
    ["lib-image-warp", imageWarp],
    ["lib-image-channel", imageChannel],
    ["lib-image-filter-extras", imageFilterExtras],
    ["lib-image-filter", imageFilter],
    ["lib-image-enhance", imageEnhance],
    ["lib-image-draw", imageDraw],
    ["image", imageCore],
    ["preview", audioPreview],
    ["audio", audioCore],
    ["lib-audio-dsp", audioDsp],
    ["lib-audio-effects", audioEffects],
    ["realtime-audio", audioRealtime],
    ["synthesis", audioSynthesis]
  ];
  const nodeClasses: unknown[] = [];
  const perGroup: Record<string, number> = {};
  for (const [name, mod] of groups) {
    const classes = collectNodeClasses(mod as Record<string, unknown>);
    perGroup[name] = classes.length;
    nodeClasses.push(...classes);
  }
  console.info(
    `[browserRunner] loaded ${nodeClasses.length} node class(es) from ${groups.length} group(s)`,
    perGroup
  );

  // The GPU-texture boundary helpers — read-back at serialize points + run-end
  // texture cleanup. Loaded here so they ride the same lazy chunk as the nodes.
  const [imageIo, gpuDevice] = await Promise.all([
    import("@nodetool-ai/image-nodes/nodes/image-io"),
    import("@nodetool-ai/image-nodes/nodes/gpu-device")
  ]);

  return {
    wf,
    nodeClasses,
    resolveImageRefForTransport: imageIo.resolveImageRefForTransport,
    releaseRunTextures: gpuDevice.releaseRunTextures
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
  const candidates = mods.nodeClasses
    .filter(isNodeClass)
    .map((c) => c.nodeType);
  const browserNodeTypes = candidates.filter((t) => registry.has(t));
  const filteredOut = candidates.filter((t) => !registry.has(t));
  console.info(
    `[browserRunner] registry ready — ${browserNodeTypes.length}/${candidates.length} loaded node type(s) are browser-capable`,
    { registered: browserNodeTypes, filteredOutByPlatform: filteredOut }
  );
  return {
    runBrowserWorkflow: mods.wf.runBrowserWorkflow,
    registry,
    browserNodeTypes,
    resolveImageRefForTransport: mods.resolveImageRefForTransport,
    releaseRunTextures: mods.releaseRunTextures
  };
}

/**
 * Map the web/Python graph serialization (node props under `data`, edge kind
 * under `type`) to the kernel's `NodeDescriptor` contract (`properties` /
 * `edge_type`). Mirrors the server's `normalizeGraph`.
 */
export function normalizeGraphForKernel(graph: WorkflowGraph): KernelGraph {
  const nodes = (graph.nodes ?? []).map((raw) => {
    if (raw.properties === undefined && raw.data !== undefined) {
      const { data, ...rest } = raw;
      return { ...rest, properties: data };
    }
    return raw;
  });
  const edges = (graph.edges ?? []).map((raw) => {
    const rawType = raw.edge_type ?? raw.type;
    const edge_type = rawType === "control" ? "control" : "data";
    const { type: _type, ...rest } = raw;
    return { ...rest, edge_type };
  });
  return { nodes, edges };
}
