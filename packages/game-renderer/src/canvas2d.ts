import type { GameRenderFrame } from "@nodetool-ai/protocol";
import type { GameRenderer, GameRendererCapabilities, GameRendererEffect, GameRendererStats } from "./index.js";
import { visibleItems, type VisibleItem } from "./frame.js";

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
  private disposed = false;

  get capabilities(): GameRendererCapabilities {
    return { backend: this.backend, core2D: true, gpuEffects: false, adapterType: "unknown",
      deviceStatus: this.disposed ? "disposed" : "ready", enabledFeatures: [], requestedFeatures: [], limits: null,
      minimalRenderSucceeded: true, deviceLossCount: 0, fallbackReason: null };
  }

  setEffect(effect: GameRendererEffect | null): void {
    if (effect) {
      throw new Error("GPU effects require WebGPU");
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
    for (let index = 0; index < items.length; index++) {
      const entry = items[index];
      const image = images[index];
      if (!entry) {
        continue;
      }
      this.drawSprite(context, entry, image, frame, pixelScale, sx, sy);
    }
    context.fillStyle = "#ffffff";
    context.font = "16px sans-serif";
    context.textBaseline = "top";
    for (const label of frame.hud) {
      context.fillText(label.text, label.x, label.y);
    }
    return { backend: this.backend, visibleSprites: items.length, drawCalls: items.length + frame.hud.length,
      uploadedBytes: 0, textureBytes: 0, targetBytes: 0, instanceBufferBytes: 0 };
  }

  private drawSprite(
    context: CanvasRenderingContext2D,
    entry: VisibleItem,
    image: GameImage | null,
    frame: GameRenderFrame,
    pixelScale: number,
    sx: number,
    sy: number,
  ): void {
    const source = image ? entry.frame ?? { x: 0, y: 0, width: imageWidth(image), height: imageHeight(image) } : undefined;
    const targetWidth = entry.width * pixelScale * sx;
    const targetHeight = entry.height * pixelScale * sy;
    const x = (frame.width / 2 + (entry.x - frame.camera.x) * pixelScale) * sx;
    const y = (frame.height / 2 - (entry.y - frame.camera.y) * pixelScale) * sy;
    const tinted = image && source ? this.tint(image, entry.assetId, source, entry.tint) : undefined;
    context.save();
    context.translate(x, y);
    context.rotate(-entry.rotation);
    context.globalAlpha = entry.opacity;
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
    this.tinted.set(key, canvas);
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
        this.tinted.delete(key);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.tinted.clear();
    this.assets.clear();
  }
}
