import type { GameRenderFrame } from "@nodetool-ai/protocol";
import type { GameRenderer, GameRendererCapabilities, GameRendererEffect, GameRendererStats } from "./index.js";
import { paintHud, projectedCamera, visibleItems, type VisibleItem } from "./frame.js";
import { applyLighting, spritePixelBounds } from "./lighting.js";

export type GameImage = ImageBitmap | HTMLImageElement;
export type GameAssetResolver = (assetId: string) => Promise<GameImage | null>;

export class AssetCache {
  private readonly images = new Map<string, Promise<GameImage | null>>();

  constructor(private readonly resolve: GameAssetResolver) {}

  get(assetId: string): Promise<GameImage | null> {
    let image = this.images.get(assetId);
    if (!image) {
      image = this.resolve(assetId).catch(() => null);
      this.images.set(assetId, image);
    }
    return image;
  }

  clear(): void {
    this.images.clear();
  }

  invalidate(assetId: string): void {
    this.images.delete(assetId);
  }
}

export function imageWidth(image: GameImage): number {
  return image instanceof HTMLImageElement ? image.naturalWidth : image.width;
}

export function imageHeight(image: GameImage): number {
  return image instanceof HTMLImageElement ? image.naturalHeight : image.height;
}

export class Canvas2DGameRenderer implements GameRenderer {
  readonly backend = "canvas2d";
  private readonly context: CanvasRenderingContext2D;
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  private lightCanvas: HTMLCanvasElement | undefined;
  private tintedBytes = 0;
  private disposed = false;

  get capabilities(): GameRendererCapabilities {
    return { backend: this.backend, core2D: true, gpuEffects: false, lighting: !this.disposed, adapterType: "unknown",
      deviceStatus: this.disposed ? "disposed" : "ready", enabledFeatures: [], requestedFeatures: [], limits: null,
      minimalRenderSucceeded: true, deviceLossCount: 0, fallbackReason: null };
  }

  setEffects(effects: readonly GameRendererEffect[]): void {
    if (effects.some((effect) => effect.required)) {
      throw new Error("Required GPU effect is unavailable in Canvas2D");
    }
  }

  constructor(readonly canvas: HTMLCanvasElement, private readonly assets: AssetCache) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Canvas2D is unavailable");
    }
    this.context = context;
    context.imageSmoothingEnabled = false;
  }

  async render(frame: GameRenderFrame, interpolation: number): Promise<GameRendererStats> {
    if (this.disposed) {
      throw new Error("Game renderer is disposed");
    }
    const items = visibleItems(frame, interpolation);
    const images = await Promise.all(items.map((entry) => this.assets.get(entry.assetId)));
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.imageSmoothingEnabled = false;
    const sx = this.canvas.width / frame.width;
    const sy = this.canvas.height / frame.height;
    const pixelScale = frame.camera.zoom;
    const camera = projectedCamera(frame, interpolation);
    let lightContext: CanvasRenderingContext2D | undefined;
    if (frame.lighting) {
      if (!this.lightCanvas) this.lightCanvas = document.createElement("canvas");
      if (this.lightCanvas.width !== this.canvas.width || this.lightCanvas.height !== this.canvas.height) {
        this.lightCanvas.width = this.canvas.width;
        this.lightCanvas.height = this.canvas.height;
      }
      lightContext = this.lightCanvas.getContext("2d") ?? undefined;
      if (!lightContext) throw new Error("Canvas2D light target is unavailable");
      lightContext.imageSmoothingEnabled = false;
    } else {
      this.lightCanvas = undefined;
    }
    const lightCanvas = this.lightCanvas;
    for (let index = 0; index < items.length; index++) {
      const entry = items[index];
      const image = images[index];
      if (!entry) continue;
      if (!lightContext || !lightCanvas || entry.unlit) {
        this.drawSprite(context, entry, image, frame, camera, pixelScale, sx, sy);
        continue;
      }
      const targetWidth = entry.width * pixelScale * sx;
      const targetHeight = entry.height * pixelScale * sy;
      const x = (frame.width / 2 + (entry.x - camera.x) * pixelScale) * sx;
      const y = (frame.height / 2 - (entry.y - camera.y) * pixelScale) * sy;
      const bounds = spritePixelBounds(x, y, targetWidth, targetHeight, entry.rotation, this.canvas.width, this.canvas.height);
      if (!bounds) continue;
      lightContext.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
      this.drawSprite(lightContext, entry, image, frame, camera, pixelScale, sx, sy, true);
      const pixels = lightContext.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
      applyLighting(pixels.data, bounds.width, bounds.height, frame, interpolation,
        { viewportWidth: this.canvas.width, viewportHeight: this.canvas.height, x: bounds.x, y: bounds.y });
      lightContext.putImageData(pixels, bounds.x, bounds.y);
      context.save();
      context.globalCompositeOperation = entry.blend === "additive" ? "lighter" : "source-over";
      context.imageSmoothingEnabled = false;
      context.drawImage(lightCanvas, bounds.x, bounds.y, bounds.width, bounds.height,
        bounds.x, bounds.y, bounds.width, bounds.height);
      context.restore();
    }
    paintHud(context, frame.hud, 1, frame.gameId);
    return { backend: this.backend, visibleSprites: items.length, drawCalls: items.length + frame.hud.length,
      uploadedBytes: 0, textureBytes: 0, targetBytes: lightCanvas ? this.canvas.width * this.canvas.height * 4 : 0,
      instanceBufferBytes: 0 };
  }

  private drawSprite(
    context: CanvasRenderingContext2D,
    entry: VisibleItem,
    image: GameImage | null,
    frame: GameRenderFrame,
    camera: { readonly x: number; readonly y: number },
    pixelScale: number,
    sx: number,
    sy: number,
    normalBlend = false,
  ): void {
    const source = image ? entry.frame ?? { x: 0, y: 0, width: imageWidth(image), height: imageHeight(image) } : undefined;
    const targetWidth = entry.width * pixelScale * sx;
    const targetHeight = entry.height * pixelScale * sy;
    const x = (frame.width / 2 + (entry.x - camera.x) * pixelScale) * sx;
    const y = (frame.height / 2 - (entry.y - camera.y) * pixelScale) * sy;
    const tinted = image && source ? this.tint(image, entry.assetId, source, entry.tint) : undefined;
    context.save();
    context.translate(x, y);
    context.rotate(-entry.rotation);
    context.scale(entry.flipX ? -1 : 1, entry.flipY ? -1 : 1);
    context.globalAlpha = entry.opacity;
    context.globalCompositeOperation = !normalBlend && entry.blend === "additive" ? "lighter" : "source-over";
    context.imageSmoothingEnabled = entry.sampling === "linear";
    if (tinted) {
      context.drawImage(tinted, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    } else if (image && source) {
      context.drawImage(image, source.x, source.y, source.width, source.height, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    } else {
      context.fillStyle = entry.assetId === "player" ? "#2acae9" : entry.assetId === "wall" ? "#5c6978" : entry.assetId === "gem" ? "#ffc432" : "#ff00ff";
      context.fillRect(-targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    }
    context.restore();
  }

  private tint(
    image: GameImage,
    assetId: string,
    source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    tint: string | undefined,
  ): HTMLCanvasElement | undefined {
    if (!tint || tint.toLowerCase() === "#ffffff") {
      return undefined;
    }
    const key = `${assetId}:${source.x},${source.y},${source.width},${source.height}:${tint}`;
    const cached = this.tinted.get(key);
    if (cached) {
      this.tinted.delete(key);
      this.tinted.set(key, cached);
      return cached;
    }
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas2D tint target is unavailable");
    }
    context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    context.globalCompositeOperation = "multiply";
    context.fillStyle = tint;
    context.fillRect(0, 0, source.width, source.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    const bytes = source.width * source.height * 4;
    if (bytes <= 16 * 1024 * 1024) {
      while (this.tinted.size >= 64 || this.tintedBytes + bytes > 16 * 1024 * 1024) {
        const oldest = this.tinted.keys().next().value;
        if (oldest === undefined) break;
        const removed = this.tinted.get(oldest);
        this.tinted.delete(oldest);
        if (removed) this.tintedBytes -= removed.width * removed.height * 4;
      }
      this.tinted.set(key, canvas);
      this.tintedBytes += bytes;
    }
    return canvas;
  }

  resize(width: number, height: number): void {
    this.canvas.width = Math.max(1, Math.floor(width));
    this.canvas.height = Math.max(1, Math.floor(height));
    this.context.imageSmoothingEnabled = false;
  }

  invalidateAsset(assetId: string): void {
    this.assets.invalidate(assetId);
    for (const key of this.tinted.keys()) {
      if (key.startsWith(`${assetId}:`)) {
        const canvas = this.tinted.get(key);
        if (canvas) this.tintedBytes -= canvas.width * canvas.height * 4;
        this.tinted.delete(key);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.tinted.clear();
    this.lightCanvas = undefined;
    this.tintedBytes = 0;
    this.assets.clear();
  }
}
