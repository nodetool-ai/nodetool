/**
 * Browser entry point for the workflow-runner E2E suite.
 *
 * Proves NodeTool's **kernel + GPU pool** execute inside a real
 * (headless) browser. Imports `@nodetool-ai/kernel` (whose actor
 * runtime has no static `node:fs/promises` / `node:os` deps) and
 * `@nodetool-ai/gpu/pool` + `/webgpu` for the shader executor and the
 * `navigator.gpu` adapter, then exposes three async helpers on
 * `window` for Playwright to drive:
 *
 *   - `runWorkflowInBrowser(graph)`      — kernel-only graph execution
 *   - `runBrightnessShaderInBrowser(...)` — WebGPU shader catalog
 *   - `runWebApisInBrowser()`             — fetch / Blob / IDB round-trip
 *
 * If these pass, the actor model + shader catalog + standard Web
 * Platform APIs all work in a V8 isolate with zero Node APIs.
 */

import {
  WorkflowRunner,
  type NodeExecutor,
  type RunResult
} from "@nodetool-ai/kernel";
import type {
  Edge,
  NodeDescriptor,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import {
  createBrowserRegistry,
  runBrowserWorkflow
} from "@nodetool-ai/workflow-runner";
// Curated pure-browser node groups (the same set the web app registers) —
// imported via core-nodes' per-file subpaths to skip the native-pulling index.
import * as constantNodes from "@nodetool-ai/core-nodes/nodes/constant";
import * as controlNodes from "@nodetool-ai/core-nodes/nodes/control";
import * as listNodes from "@nodetool-ai/core-nodes/nodes/list";

// ── Inline NodeExecutor map (plain objects, no BaseNode) ───────────────

const executors: Record<
  string,
  (descriptor: NodeDescriptor) => NodeExecutor
> = {
  "browsertest.ConstantText": (d) => ({
    async process() {
      const props = (d.properties as { value?: string }) ?? {};
      return { output: String(props.value ?? "") };
    }
  }),
  "browsertest.Uppercase": () => ({
    async process(inputs) {
      return { output: String(inputs.text ?? "").toUpperCase() };
    }
  }),
  "browsertest.Concat": () => ({
    async process(inputs) {
      return { output: `${inputs.a ?? ""}${inputs.b ?? ""}` };
    }
  })
};

// ── Harness API exposed to Playwright ───────────────────────────────────

interface GraphData {
  nodes: NodeDescriptor[];
  edges: Edge[];
}

interface BrowserRunResult {
  status: RunResult["status"];
  outputs: Record<string, unknown[]>;
  messageTypes: string[];
  error?: string;
}

interface BrightnessPixelCheck {
  /** Width and height of the test image (also the workgroup tile size). */
  size: number;
  /** Source RGB tuple in [0,255]; alpha is always 255. */
  source: [number, number, number];
  /** brightness param sent to color.brightnessContrast (range [-1, 1]). */
  brightness: number;
  /** contrast multiplier (range [0, 4]). */
  contrast: number;
}

interface BrightnessShaderResult {
  ok: boolean;
  adapterFound: boolean;
  /** First output pixel after readback (RGBA, 0–255). */
  outputPixel?: [number, number, number, number];
  /** Min / max deltas vs. the CPU reference across all RGB channels. */
  maxAbsError?: number;
  error?: string;
}

interface WebApiResult {
  fetch: boolean;
  blob: boolean;
  objectUrl: boolean;
  indexedDb: boolean;
  cryptoSubtle: boolean;
  /** Captured first error message if any check threw. */
  error?: string;
}

interface BrowserNodesRunResult extends BrowserRunResult {
  /** True iff every streamed message carried the run's job_id + workflow_id. */
  allStamped: boolean;
}

declare global {
  interface Window {
    runWorkflowInBrowser: (
      graph: GraphData,
      params?: Record<string, unknown>
    ) => Promise<BrowserRunResult>;
    runBrowserNodesInBrowser: (
      graph: GraphData,
      params?: Record<string, unknown>
    ) => Promise<BrowserNodesRunResult>;
    runBrightnessShaderInBrowser: (
      check: BrightnessPixelCheck
    ) => Promise<BrightnessShaderResult>;
    runWebApisInBrowser: () => Promise<WebApiResult>;
    runtimeName: string;
  }
}

window.runtimeName =
  typeof navigator !== "undefined" ? navigator.userAgent : "unknown";

window.runWorkflowInBrowser = async (
  graph: GraphData,
  params: Record<string, unknown> = {}
): Promise<BrowserRunResult> => {
  const jobId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `job_${Date.now()}`;

  const passthrough: NodeExecutor = {
    async process(inputs) {
      return inputs;
    }
  };

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node) => {
      const factory = executors[node.type];
      return factory ? factory(node) : passthrough;
    }
  });

  const result = await runner.run({ job_id: jobId, params }, graph);
  const messageTypes: string[] = [];
  for (const m of result.messages as ProcessingMessage[]) {
    messageTypes.push(m.type);
  }
  return {
    status: result.status,
    outputs: result.outputs,
    messageTypes,
    error: result.error
  };
};

// ── WebGPU shader harness ───────────────────────────────────────────────

/**
 * Drive the shared `color.brightnessContrast` shader module against the
 * browser's `navigator.gpu` device, then compare the readback against
 * the same arithmetic computed on the CPU. The shader runs in linear
 * premultiplied space; we mirror it by premultiplying the source and
 * un-premultiplying after applying `brightness + (color - 0.5) * contrast + 0.5`.
 */
window.runBrightnessShaderInBrowser = async (
  check: BrightnessPixelCheck
): Promise<BrightnessShaderResult> => {
  try {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) {
      return { ok: false, adapterFound: false, error: "navigator.gpu missing" };
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { ok: false, adapterFound: false, error: "no WebGPU adapter" };
    }

    const { colorBrightnessContrastV1, createExecutor, createLabeledTexture } =
      await import("@nodetool-ai/gpu/pool");
    const { createBrowserGPUContext } = await import("@nodetool-ai/gpu/webgpu");

    const ctx = await createBrowserGPUContext();
    const device = ctx.device;
    const executor = createExecutor();

    const { size, source, brightness, contrast } = check;
    const srcPixels = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const off = i * 4;
      // Alpha = 1 means premultiplied == straight, so no premul step.
      srcPixels[off] = source[0];
      srcPixels[off + 1] = source[1];
      srcPixels[off + 2] = source[2];
      srcPixels[off + 3] = 255;
    }

    const sourceTex = createLabeledTexture(device, {
      label: "brightness-source",
      width: size,
      height: size,
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });
    const outputTex = createLabeledTexture(device, {
      label: "brightness-output",
      width: size,
      height: size,
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });

    device.queue.writeTexture(
      { texture: sourceTex.texture },
      srcPixels,
      { bytesPerRow: size * 4, rowsPerImage: size },
      { width: size, height: size }
    );

    const encoder = device.createCommandEncoder({ label: "brightness-encode" });
    executor.encode({
      ctx,
      module: colorBrightnessContrastV1,
      encoder,
      inputs: { source: sourceTex },
      output: outputTex,
      params: { brightness, contrast },
      dispatch: { kind: "fragment" }
    });
    device.queue.submit([encoder.finish()]);

    // Readback the whole texture (we only check pixel 0).
    const rowStride = Math.ceil((size * 4) / 256) * 256;
    const readback = device.createBuffer({
      size: rowStride * size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    const readEncoder = device.createCommandEncoder({ label: "brightness-readback" });
    readEncoder.copyTextureToBuffer(
      { texture: outputTex.texture },
      { buffer: readback, bytesPerRow: rowStride, rowsPerImage: size },
      { width: size, height: size }
    );
    device.queue.submit([readEncoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readback.getMappedRange());

    const outputPixel: [number, number, number, number] = [
      mapped[0],
      mapped[1],
      mapped[2],
      mapped[3]
    ];

    // CPU reference matches the shader: clamp((s - 0.5) * contrast + 0.5 + b, 0, 1).
    const ref = (c: number): number => {
      const linear = c / 255;
      const adjusted = Math.max(
        0,
        Math.min(1, (linear - 0.5) * contrast + 0.5 + brightness)
      );
      return Math.round(adjusted * 255);
    };
    const expected = [ref(source[0]), ref(source[1]), ref(source[2])];
    const maxAbsError = Math.max(
      Math.abs(outputPixel[0] - expected[0]),
      Math.abs(outputPixel[1] - expected[1]),
      Math.abs(outputPixel[2] - expected[2])
    );

    readback.unmap();
    readback.destroy();
    sourceTex.destroy();
    outputTex.destroy();

    return { ok: true, adapterFound: true, outputPixel, maxAbsError };
  } catch (err) {
    return {
      ok: false,
      adapterFound: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};

// ── Web Platform API surface check ──────────────────────────────────────

window.runWebApisInBrowser = async (): Promise<WebApiResult> => {
  const result: WebApiResult = {
    fetch: false,
    blob: false,
    objectUrl: false,
    indexedDb: false,
    cryptoSubtle: false
  };
  try {
    // Same-origin fetch of the harness HTML.
    const res = await fetch("/");
    result.fetch = res.ok;

    // Blob + URL.createObjectURL round-trip.
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const blobBack = await (await fetch(url)).arrayBuffer();
    URL.revokeObjectURL(url);
    result.blob = blobBack.byteLength === 4;
    result.objectUrl = url.startsWith("blob:");

    // IndexedDB open + put + get.
    result.indexedDb = await new Promise<boolean>((resolve) => {
      const open = indexedDB.open("e2e-test", 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore("kv");
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put("hello", "k");
        tx.oncomplete = () => {
          const tx2 = db.transaction("kv", "readonly");
          const got = tx2.objectStore("kv").get("k");
          got.onsuccess = () => {
            db.close();
            indexedDB.deleteDatabase("e2e-test");
            resolve(got.result === "hello");
          };
          got.onerror = () => resolve(false);
        };
        tx.onerror = () => resolve(false);
      };
      open.onerror = () => resolve(false);
    });

    // SubtleCrypto digest.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("nodetool")
    );
    result.cryptoSubtle = digest.byteLength === 32;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
};

// ── Production browser path: createBrowserRegistry + runBrowserWorkflow ──────

/** A class is a node executor if it exposes a static `nodeType` string. */
function collectNodeClasses(mod: Record<string, unknown>): unknown[] {
  return Object.values(mod).filter(
    (value) =>
      typeof value === "function" &&
      typeof (value as { nodeType?: unknown }).nodeType === "string"
  );
}

let browserRegistry: ReturnType<typeof createBrowserRegistry> | null = null;
function getBrowserRegistry(): ReturnType<typeof createBrowserRegistry> {
  if (!browserRegistry) {
    const classes = [constantNodes, controlNodes, listNodes].flatMap((mod) =>
      collectNodeClasses(mod as Record<string, unknown>)
    );
    browserRegistry = createBrowserRegistry(
      classes as Parameters<typeof createBrowserRegistry>[0]
    );
  }
  return browserRegistry;
}

/**
 * Drive the exact API the web app uses for in-browser sub-graph execution:
 * a NodeRegistry built from the real (decorator-compiled) core node classes,
 * run through `runBrowserWorkflow`, which emits a job/workflow-stamped
 * ProcessingMessage stream.
 */
window.runBrowserNodesInBrowser = async (
  graph: GraphData,
  params: Record<string, unknown> = {}
): Promise<BrowserNodesRunResult> => {
  const jobId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `job_${Date.now()}`;
  const workflowId = "e2e-browser-nodes";

  const gen = runBrowserWorkflow({
    graph,
    registry: getBrowserRegistry(),
    params,
    jobId,
    workflowId
  });

  const messageTypes: string[] = [];
  let allStamped = true;
  let result: RunResult;
  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    const record = next.value as unknown as Record<string, unknown>;
    messageTypes.push(String(record.type));
    if (record.job_id !== jobId || record.workflow_id !== workflowId) {
      allStamped = false;
    }
  }

  return {
    status: result.status,
    outputs: result.outputs,
    messageTypes,
    allStamped,
    error: result.error
  };
};

(window as unknown as { workflowRunnerReady: boolean }).workflowRunnerReady =
  true;
