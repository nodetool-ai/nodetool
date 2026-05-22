/**
 * @nodetool-ai/gpu/node — Node.js (Dawn) host adapter.
 *
 * Acquires a `GPUDevice` from the optional `webgpu` (Dawn) npm package and
 * exposes the headless compositing path on top of it. Kept in its own entry
 * so the native Dawn binding is only loaded when a Node consumer actually
 * asks for server-side GPU work — the pure catalog (`.`), the pool (`./pool`),
 * and the browser engine (`./webgpu`) never pull it in.
 *
 * WebGPU is required for this path; there is no silent CPU fallback. If Dawn
 * is unavailable the device acquisition fails loud and the caller decides
 * whether to fall back (e.g. to a Sharp-based node).
 */

import { createGPUContextFromDevice, type GPUContext } from "./context.js";
import {
  compositeLayersHeadless,
  type HeadlessLayer,
  type HeadlessCompositeResult
} from "./compositor/headless.js";
import type { LayerTransform2D } from "./compositor/transform.js";

type DawnModule = {
  create?: (flags: string[]) => GPU;
  /**
   * The WebGPU flag namespaces (`GPUShaderStage`, `GPUBufferUsage`,
   * `GPUTextureUsage`, `GPUMapMode`, …). Dawn ships these to be installed on
   * `globalThis` rather than defining them itself.
   */
  globals?: Record<string, unknown>;
};

let devicePromise: Promise<GPUDevice> | null = null;

/**
 * Dawn instances we've created, kept alive for the process lifetime.
 *
 * dawn.node's `AsyncRunner` schedules `InstanceBase::ProcessEvents()` on the
 * Node event loop (via setImmediate) for as long as the GPU instance lives.
 * Only the resulting `GPUDevice` is cached below — the instance itself is a
 * local in {@link createNodeGPUDevice}, so once it returns, the instance is
 * unreferenced and eligible for GC. If a queued `ProcessEvents()` callback
 * then fires after the instance is finalized, it locks a freed mutex and the
 * process dies with `SIGSEGV` in `dawn::native::InstanceBase::ProcessEvents`
 * (no JS error, just a hard crash). Retaining every instance prevents that.
 */
const retainedDawnInstances: GPU[] = [];

/**
 * Install the WebGPU flag namespaces Dawn provides onto `globalThis`. In a
 * browser these are ambient globals; under Node/Dawn they live on the module's
 * `globals` export and must be assigned before anything references them. Both
 * our own descriptors and typegpu's bind-group-layout builder read them as
 * globals (e.g. `GPUShaderStage.FRAGMENT`), so a missing assignment surfaces as
 * a `ReferenceError: GPUShaderStage is not defined` only once a layout is
 * materialized. Existing globals are left untouched.
 */
function installWebGPUGlobals(dawn: DawnModule): void {
  if (!dawn.globals) return;
  for (const [key, value] of Object.entries(dawn.globals)) {
    if (!(key in globalThis)) {
      (globalThis as Record<string, unknown>)[key] = value;
    }
  }
}

/**
 * Acquire a fresh `GPUDevice` from Dawn. Throws a clear error if the optional
 * `webgpu` package is not installed or no adapter is available.
 */
export async function createNodeGPUDevice(): Promise<GPUDevice> {
  // Variable specifier keeps bundlers (and tsc) from trying to resolve the
  // native module at build time — it's an optional, runtime-only dependency.
  const spec = "webgpu";
  let dawn: DawnModule;
  try {
    dawn = (await import(/* @vite-ignore */ spec)) as DawnModule;
  } catch (err) {
    throw new Error(
      "Node WebGPU support requires the optional 'webgpu' (Dawn) package. " +
        "Install it with `npm install webgpu`.",
      { cause: err as Error }
    );
  }
  installWebGPUGlobals(dawn);
  const gpu = dawn.create?.([]);
  if (!gpu) {
    throw new Error("Failed to create a Dawn GPU instance (webgpu.create)");
  }
  // Keep the instance alive: its AsyncRunner keeps scheduling ProcessEvents()
  // on the event loop, which segfaults if the instance is GC'd out from under
  // it (see retainedDawnInstances).
  retainedDawnInstances.push(gpu);
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No WebGPU adapter available (Node/Dawn)");
  }
  return adapter.requestDevice();
}

/**
 * Cached `GPUDevice` — acquiring a Dawn device is expensive, so a node that
 * runs repeatedly reuses one across executions. A failed acquisition clears
 * the cache so a later call can retry.
 */
export async function getNodeGPUDevice(): Promise<GPUDevice> {
  if (!devicePromise) {
    devicePromise = createNodeGPUDevice().catch((err) => {
      devicePromise = null;
      throw err;
    });
  }
  return devicePromise;
}

/** Build a {@link GPUContext} backed by a Dawn device (for pool/Executor use). */
export async function createNodeGPUContext(): Promise<GPUContext> {
  return createGPUContextFromDevice(await getNodeGPUDevice());
}

/**
 * Composite image layers on the GPU using the cached Dawn device. The
 * convenience entry server-side nodes call: pass decoded straight-alpha RGBA
 * layers, get back composited straight-alpha RGBA.
 */
export async function compositeImageLayers(
  layers: HeadlessLayer[],
  canvasWidth: number,
  canvasHeight: number
): Promise<HeadlessCompositeResult> {
  const device = await getNodeGPUDevice();
  return compositeLayersHeadless(device, layers, canvasWidth, canvasHeight);
}

export { compositeLayersHeadless };
export type { HeadlessLayer, HeadlessCompositeResult, LayerTransform2D };
