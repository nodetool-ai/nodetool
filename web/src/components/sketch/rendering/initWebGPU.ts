/**
 * WebGPU initialization and runtime factory.
 *
 * Provides:
 * - `initWebGPU()` – request adapter + device with error handling
 * - `createRuntime()` – create WebGPURuntime or Canvas2DRuntime fallback
 * - `isWebGPUAvailable()` – synchronous check for navigator.gpu
 */

import type { SketchRuntime } from "./types";
import { Canvas2DRuntime } from "./Canvas2DRuntime";
import { WebGPURuntime } from "./WebGPURuntime";

/** Synchronous check: does the browser expose the WebGPU API? */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Result of WebGPU initialization. */
export interface WebGPUInitResult {
  adapter: GPUAdapter;
  device: GPUDevice;
}

/**
 * Request a WebGPU adapter and device.
 * Throws if WebGPU is not available or initialization fails.
 */
export async function initWebGPU(): Promise<WebGPUInitResult> {
  if (!isWebGPUAvailable()) {
    throw new Error("WebGPU is not available in this browser");
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance"
  });
  if (!adapter) {
    throw new Error("Failed to get WebGPU adapter");
  }
  const device = await adapter.requestDevice();
  // Listen for uncaptured errors
  device.addEventListener("uncapturederror", (event) => {
    console.error("[WebGPU] Uncaptured device error:", event);
  });
  // Handle device loss
  device.lost.then((info) => {
    console.error("[WebGPU] Device lost:", info.message, info.reason);
  });
  return { adapter, device };
}

/**
 * Create a SketchRuntime: tries WebGPU first, falls back to Canvas2D.
 *
 * @param layerCanvases  Shared map for layer canvas storage (DI).
 * @returns The runtime and a flag indicating which backend was used.
 */
export async function createRuntime(
  layerCanvases?: Map<string, HTMLCanvasElement>
): Promise<{ runtime: SketchRuntime; backend: "webgpu" | "canvas2d" }> {
  if (isWebGPUAvailable()) {
    try {
      const { device } = await initWebGPU();
      const runtime = new WebGPURuntime(device, layerCanvases);
      return { runtime, backend: "webgpu" };
    } catch (err) {
      console.warn(
        "[Sketch] WebGPU init failed, falling back to Canvas2D:",
        err
      );
    }
  }
  const runtime = new Canvas2DRuntime(layerCanvases);
  return { runtime, backend: "canvas2d" };
}
