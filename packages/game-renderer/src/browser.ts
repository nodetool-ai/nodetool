import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { AssetCache, Canvas2DGameRenderer, type GameAssetResolver } from "./canvas2d.js";
import type { GameHudEffectOrder, GameRenderer, GameRendererBackend, GameRendererCapabilities, GameRendererEffect, GameRendererStats } from "./index.js";
import { WebGPUGameRenderer } from "./webgpu.js";
export { loadBrowserGameFonts } from "./browser-fonts.js";

export interface CreateGameRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly assets: GameAssetResolver;
  readonly backend?: "auto" | GameRendererBackend;
}

function replacementCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const replacement = document.createElement("canvas");
  replacement.width = canvas.width;
  replacement.height = canvas.height;
  replacement.id = canvas.id;
  replacement.className = canvas.className;
  replacement.style.cssText = canvas.style.cssText;
  canvas.parentNode?.replaceChild(replacement, canvas);
  return replacement;
}

class RecoveringGameRenderer implements GameRenderer {
  private effects: readonly GameRendererEffect[] = [];
  private deviceLossCount = 0;
  private fallbackReason: string | null = null;
  constructor(private current: GameRenderer, private readonly assets: GameAssetResolver) {}

  get backend(): GameRendererBackend { return this.current.backend; }
  get canvas(): HTMLCanvasElement { return this.current.canvas; }
  get capabilities(): GameRendererCapabilities {
    return { ...this.current.capabilities, deviceLossCount: this.deviceLossCount,
      fallbackReason: this.fallbackReason };
  }
  setEffects(effects: readonly GameRendererEffect[], hudOrder?: GameHudEffectOrder): void {
    this.current.setEffects(effects, hudOrder);
    this.effects = effects;
  }

  async render(frame: GameRenderFrame, interpolation: number): Promise<GameRendererStats> {
    if (this.effects.some((effect) => effect.required) && !this.current.capabilities.gpuEffects) {
      throw new Error("Required GPU effect is unavailable after WebGPU failure");
    }
    try {
      return await this.current.render(frame, interpolation);
    } catch (error) {
      if (this.current.backend !== "webgpu" || !(error instanceof Error) ||
        (error.message !== "WebGPU device was lost" && !error.message.startsWith("WebGPU game render failed"))) {
        throw error;
      }
      const canvas = replacementCanvas(this.current.canvas);
      this.current.dispose();
      this.current = new Canvas2DGameRenderer(canvas, new AssetCache(this.assets));
      this.deviceLossCount++;
      this.fallbackReason = error.message;
      if (this.effects.some((effect) => effect.required)) {
        throw new Error("Required GPU effect is unavailable after WebGPU failure");
      }
      this.effects = [];
      return this.current.render(frame, interpolation);
    }
  }

  resize(width: number, height: number): void { this.current.resize(width, height); }
  invalidateAsset(assetId: string): void { this.current.invalidateAsset(assetId); }
  dispose(): void { this.current.dispose(); }
}

/** Creates a browser game renderer, falling back to Canvas2D when WebGPU is unavailable. */
export async function createGameRenderer(options: CreateGameRendererOptions): Promise<GameRenderer> {
  const backend = options.backend ?? "auto";
  if (backend !== "canvas2d" && typeof navigator !== "undefined" && navigator.gpu) {
    let device: GPUDevice | undefined;
    let context: GPUCanvasContext | null = null;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        device = await adapter.requestDevice();
        context = options.canvas.getContext("webgpu");
        if (context) {
          const format = navigator.gpu.getPreferredCanvasFormat();
          context.configure({ device, format, alphaMode: "premultiplied" });
          const info = adapter.info;
          const adapterType = info?.device?.toLowerCase().includes("software") ||
            info?.architecture?.toLowerCase().includes("swiftshader") ||
            info?.architecture?.toLowerCase().includes("llvmpipe") ? "software" : "unknown";
          return new RecoveringGameRenderer(
            new WebGPUGameRenderer(options.canvas, device, context, format, new AssetCache(options.assets), adapterType),
            options.assets,
          );
        }
        device.destroy();
      }
    } catch (error) {
      context?.unconfigure();
      device?.destroy();
      if (backend === "webgpu") {
        throw error;
      }
      return new Canvas2DGameRenderer(replacementCanvas(options.canvas), new AssetCache(options.assets));
    }
  }
  if (backend === "webgpu") {
    throw new Error("WebGPU is unavailable on this device");
  }
  return new Canvas2DGameRenderer(options.canvas, new AssetCache(options.assets));
}

export type { GameAssetResolver, GameImage } from "./canvas2d.js";
