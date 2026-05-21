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

type DawnModule = { create?: (flags: string[]) => GPU };

let devicePromise: Promise<GPUDevice> | null = null;

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
  const gpu = dawn.create?.([]);
  if (!gpu) {
    throw new Error("Failed to create a Dawn GPU instance (webgpu.create)");
  }
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
export type { HeadlessLayer, HeadlessCompositeResult };
