import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { AssetCache, Canvas2DGameRenderer, type GameImage } from "../../src/canvas2d.js";
import { WebGPUGameRenderer } from "../../src/webgpu.js";

export { gameFontFamily } from "../../src/fonts.js";
export { PARTICLE_DOT_ASSET } from "../../src/particles/render2d.js";

export const SIZE = 64;

export function sprite(assetId: string, overrides: Partial<GameRenderFrame["sprites"][number]> = {}): GameRenderFrame["sprites"][number] {
  return { entityId: assetId, assetId, x: 0, y: 0, previousX: 0, previousY: 0,
    rotation: 0, scaleX: 1, scaleY: 1, width: 16, height: 16, layer: 0, unlit: true, ...overrides };
}

export function frame(sprites: GameRenderFrame["sprites"], overrides: Partial<GameRenderFrame> = {}): GameRenderFrame {
  return { tick: 1, width: SIZE, height: SIZE, pixelsPerUnit: 1, camera: { x: 0, y: 0, zoom: 1 },
    sprites, tiles: [], hud: [], ...overrides };
}

export function pixel(bytes: readonly number[], x: number, y: number): number[] {
  return bytes.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4);
}

export async function image(width: number, height: number, rgba: readonly number[]): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(Uint8ClampedArray.from(rgba), width, height), { premultiplyAlpha: "none" });
}

export interface NativeTextureAllocation {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly createdSubmitCount: number;
  destroyAttempts: number;
  destroyCalls: number;
  destroyedSubmitCount?: number;
}

// Observe logical native allocation/deletion, not driver memory reclamation.
// Every returned texture and every GPU command is still supplied by the real device.
function observeDevice(device: GPUDevice): {
  readonly device: GPUDevice;
  readonly allocations: NativeTextureAllocation[];
  readonly submitCount: () => number;
  readonly disposed: () => boolean;
  suppressDestroy(id: number): void;
  failNextImageCopy(): void;
} {
  const allocations: NativeTextureAllocation[] = [];
  const suppressed = new Set<number>();
  let submits = 0;
  let disposed = false;
  let failImageCopy = false;
  const queue = new Proxy(device.queue, { get(target, key) {
    if (key === "submit") {
      return (commands: Iterable<GPUCommandBuffer>): void => { target.submit(commands); submits++; };
    }
    if (key === "copyExternalImageToTexture") {
      return (...args: Parameters<GPUQueue["copyExternalImageToTexture"]>): void => {
        if (failImageCopy) {
          failImageCopy = false;
          throw new Error("Injected external image copy failure");
        }
        target.copyExternalImageToTexture(...args);
      };
    }
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const observed = new Proxy(device, { get(target, key) {
    if (key === "queue") { return queue; }
    if (key === "destroy") { return (): void => { disposed = true; target.destroy(); }; }
    if (key === "createTexture") {
      return (descriptor: GPUTextureDescriptor): GPUTexture => {
        const texture = target.createTexture(descriptor);
        if (texture.dimension !== "2d") { throw new Error(`Unaccounted test texture dimension ${texture.dimension}`); }
        const bytesPerPixel = texture.format === "rgba16float" ? 8 : texture.format === "rgba8unorm" ? 4 : undefined;
        if (bytesPerPixel === undefined) { throw new Error(`Unaccounted test texture format ${texture.format}`); }
        let bytes = 0;
        for (let mip = 0; mip < texture.mipLevelCount; mip++) {
          bytes += Math.max(1, texture.width >> mip) * Math.max(1, texture.height >> mip) *
            texture.depthOrArrayLayers * texture.sampleCount * bytesPerPixel;
        }
        const allocation: NativeTextureAllocation = { id: allocations.length, width: texture.width,
          height: texture.height, bytes, createdSubmitCount: submits, destroyAttempts: 0, destroyCalls: 0 };
        allocations.push(allocation);
        const destroy = texture.destroy.bind(texture);
        Object.defineProperty(texture, "destroy", { value: (): void => {
          allocation.destroyAttempts++;
          if (suppressed.has(allocation.id)) { return; }
          allocation.destroyCalls++;
          allocation.destroyedSubmitCount = submits;
          destroy();
        } });
        return texture;
      };
    }
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { device: observed, allocations, submitCount: () => submits, disposed: () => disposed,
    suppressDestroy: (id) => { suppressed.add(id); }, failNextImageCopy: () => { failImageCopy = true; } };
}

export async function createGpu(resolve: (assetId: string) => Promise<GameImage | null>): Promise<{
  readonly renderer: WebGPUGameRenderer;
  read(): Promise<number[]>;
  readonly validationErrors: string[];
  readonly allocations: NativeTextureAllocation[];
  submitCount(): number;
  suppressDestroy(id: number): void;
  failNextImageCopy(): void;
  settleValidation(): Promise<void>;
  dispose(): void;
}> {
  if (!navigator.gpu) { throw new Error("Chromium WebGPU is unavailable"); }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { throw new Error("Chromium WebGPU adapter is unavailable"); }
  const info = adapter.info;
  console.info(`GPU parity adapter: ${JSON.stringify({ vendor: info.vendor, architecture: info.architecture,
    device: info.device, description: info.description })}`);
  const device = await adapter.requestDevice();
  const validationErrors: string[] = [];
  device.addEventListener("uncapturederror", (event) => { validationErrors.push(event.error.message); });
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const target = device.createTexture({ size: [SIZE, SIZE], format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  // Supply a real offscreen target in place of the browser swapchain.
  const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
  const observed = observeDevice(device);
  let renderer: WebGPUGameRenderer;
  try {
    renderer = new WebGPUGameRenderer(canvas, observed.device, context, "rgba8unorm", new AssetCache(resolve));
  } catch (error) {
    target.destroy();
    device.destroy();
    throw error;
  }
  return {
    renderer, validationErrors, allocations: observed.allocations,
    submitCount: observed.submitCount, suppressDestroy: observed.suppressDestroy,
    failNextImageCopy: observed.failNextImageCopy,
    async settleValidation() {
      if (!observed.disposed()) { await device.queue.onSubmittedWorkDone(); }
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    },
    async read() {
      const buffer = device.createBuffer({ size: SIZE * SIZE * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      try {
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow: SIZE * 4 }, [SIZE, SIZE]);
        device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);
        return Array.from(new Uint8Array(buffer.getMappedRange()));
      } finally { buffer.unmap(); buffer.destroy(); }
    },
    dispose() { target.destroy(); renderer.dispose(); }
  };
}

export function createCanvas(resolve: (assetId: string) => Promise<GameImage | null>): {
  readonly renderer: Canvas2DGameRenderer;
  read(): number[];
  dispose(): void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new Canvas2DGameRenderer(canvas, new AssetCache(resolve));
  return { renderer,
    read() {
      const context = canvas.getContext("2d");
      if (!context) { throw new Error("Canvas2D reference context is unavailable"); }
      return Array.from(context.getImageData(0, 0, SIZE, SIZE).data);
    },
    dispose() { renderer.dispose(); }
  };
}
