/**
 * Thin wrapper that runs the live preview's `WebGPUCompositor` against a
 * hidden canvas sized to the sequence's full resolution.
 *
 * `render()` returns *after* the GPU work for this frame has completed so
 * the canvas is safe to read with `new VideoFrame(canvas, …)`.
 */

import { WebGPUCompositor } from "../../../components/timeline/preview/gpu/compositor";
import type { CompositeLayer } from "../../../components/timeline/preview/gpu/types";

export class OffscreenCompositor {
  private compositor: WebGPUCompositor | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private container: HTMLDivElement | null = null;

  /**
   * Initialises a hidden canvas at `width × height` and attaches the WebGPU
   * compositor. Returns `{ ok: false, reason }` when WebGPU is unavailable.
   */
  async init(
    width: number,
    height: number
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const container = document.createElement("div");
    container.style.cssText =
      "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-9999px;top:-9999px;";
    document.body.appendChild(container);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);

    const compositor = new WebGPUCompositor();
    const result = await compositor.init(canvas);
    if (!result.ok) {
      compositor.dispose();
      container.remove();
      return { ok: false, reason: result.reason ?? "WebGPU init failed" };
    }

    this.canvas = canvas;
    this.container = container;
    this.compositor = compositor;
    return { ok: true };
  }

  get outputCanvas(): HTMLCanvasElement {
    if (!this.canvas) throw new Error("OffscreenCompositor not initialised");
    return this.canvas;
  }

  /**
   * Composites `layers` onto the canvas and resolves after the GPU has
   * acknowledged the work, so the canvas surface is safe to sample. We
   * intentionally don't expose the underlying compositor — callers should
   * stick to this narrow interface.
   */
  async renderFrame(layers: CompositeLayer[]): Promise<HTMLCanvasElement> {
    if (!this.compositor || !this.canvas) {
      throw new Error("OffscreenCompositor not initialised");
    }
    this.compositor.setLayers(layers);
    this.compositor.render();

    // The WebGPUCompositor doesn't expose its GPUDevice. Force a swapchain
    // flip by reading back a 1×1 pixel — this serialises against pending
    // queue submits and makes the canvas safe for VideoFrame creation.
    // (Reading a single pixel is ~free and only happens once per frame.)
    await flushCanvas(this.canvas);

    return this.canvas;
  }

  dispose(): void {
    this.compositor?.dispose();
    this.compositor = null;
    this.canvas = null;
    this.container?.remove();
    this.container = null;
  }
}

/**
 * Forces the canvas's WebGPU work to flush by requesting an ImageBitmap
 * snapshot. `createImageBitmap` waits for outstanding GPU writes, so the
 * resulting bitmap (which we throw away) is a barrier for the next
 * VideoFrame read.
 */
async function flushCanvas(canvas: HTMLCanvasElement): Promise<void> {
  try {
    const bmp = await createImageBitmap(canvas, 0, 0, 1, 1);
    bmp.close();
  } catch {
    // Some browsers reject createImageBitmap from a WebGPU canvas — in that
    // case the queue submit + the implicit fence in VideoFrame construction
    // are enough on their own.
  }
}
