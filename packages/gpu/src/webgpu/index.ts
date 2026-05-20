/**
 * @nodetool-ai/gpu/webgpu — Browser/WebGPU runtime entry point.
 *
 * Kept separate from the package root so the pure blend catalog + pool
 * contracts (the root export) stay importable by Node-side consumers without
 * pulling in `navigator.gpu`. This entry adds the browser `GPUContext`
 * adapter and the shared layer-compositing engine.
 */

export * from "../compositor/index.js";
export { createBrowserGPUContext } from "../context.js";
