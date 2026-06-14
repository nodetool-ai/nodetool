import { Canvas2DCompositor } from "./canvas2dCompositor";
import type { CompositorInitResult, TimelineCompositor } from "./types";

export type CompositorBackend = "webgpu" | "canvas2d";

export interface CreateCompositorResult {
  compositor: TimelineCompositor;
  backend: CompositorBackend;
  init: CompositorInitResult;
}

/**
 * Create and initialise a timeline compositor for `canvas`, preferring WebGPU
 * and falling back to a Canvas2D implementation when WebGPU is unavailable.
 *
 * The fallback keeps the live preview and the offline export working on
 * browsers without WebGPU and in headless CI where SwiftShader's WebGPU fails
 * to initialise — so documentation screenshots still capture composited frames
 * instead of a "WebGPU not available" placeholder.
 *
 * The WebGPU backend (and its typegpu/GPU bundle) is dynamically imported only
 * when `navigator.gpu` is present, so a browser without WebGPU never pays to
 * load it. When WebGPU fails before it ever claims the canvas context — the
 * common case: no adapter — the same canvas is reused for Canvas2D. The
 * returned `compositor` is already initialised when `init.ok` is true; the
 * caller owns disposing it.
 */
export async function createCompositor(
  canvas: HTMLCanvasElement
): Promise<CreateCompositorResult> {
  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const { WebGPUCompositor } = await import("./compositor");
      const gpu = new WebGPUCompositor();
      const gpuInit = await gpu.init(canvas);
      if (gpuInit.ok) {
        return { compositor: gpu, backend: "webgpu", init: gpuInit };
      }
      gpu.dispose();
    } catch {
      // Fall through to the Canvas2D backend below.
    }
  }

  const canvas2d = new Canvas2DCompositor();
  const init = await canvas2d.init(canvas);
  return { compositor: canvas2d, backend: "canvas2d", init };
}
