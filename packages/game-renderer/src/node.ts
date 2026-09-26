import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { visibleItems } from "./frame.js";

export interface CaptureGameFrameOptions {
  readonly resolveAsset?: (assetId: string) => Promise<Uint8Array | null>;
  readonly interpolation?: number;
  readonly scale?: number;
}

/** Renders one frame to PNG without a browser or GPU. Asset resolution receives full IDs. */
export async function captureGameFrame(frame: GameRenderFrame, options: CaptureGameFrameOptions = {}): Promise<Uint8Array> {
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Capture scale must be positive");
  }
  const canvas = createCanvas(Math.max(1, Math.round(frame.width * frame.pixelsPerUnit * scale)), Math.max(1, Math.round(frame.height * frame.pixelsPerUnit * scale)));
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  const items = visibleItems(frame, options.interpolation ?? 1);
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof loadImage>> | null>>();
  const getImage = (assetId: string): Promise<Awaited<ReturnType<typeof loadImage>> | null> => {
    let image = cache.get(assetId);
    if (!image) {
      image = (async () => {
        const bytes = await options.resolveAsset?.(assetId);
        if (!bytes) {
          return null;
        }
        return loadImage(Buffer.from(bytes));
      })().catch(() => null);
      cache.set(assetId, image);
    }
    return image;
  };
  const images = await Promise.all(items.map((entry) => getImage(entry.assetId)));
  const tinted = new Map<string, typeof canvas>();
  const pixelScale = frame.pixelsPerUnit * frame.camera.zoom * scale;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) {
      continue;
    }
    const image = images[index];
    const x = canvas.width / 2 + (item.x - frame.camera.x) * pixelScale;
    const y = canvas.height / 2 - (item.y - frame.camera.y) * pixelScale;
    const width = item.width * pixelScale;
    const height = item.height * pixelScale;
    context.save();
    context.translate(x, y);
    context.rotate(-item.rotation);
    context.globalAlpha = item.opacity;
    if (image) {
      const source = item.frame ?? { x: 0, y: 0, width: image.width, height: image.height };
      if (item.tint && item.tint.toLowerCase() !== "#ffffff") {
        const key = `${item.assetId}:${source.x},${source.y},${source.width},${source.height}:${item.tint}`;
        let tintCanvas = tinted.get(key);
        if (!tintCanvas) {
          tintCanvas = createCanvas(source.width, source.height);
          const tintContext = tintCanvas.getContext("2d");
          tintContext.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
          tintContext.globalCompositeOperation = "multiply";
          tintContext.fillStyle = item.tint;
          tintContext.fillRect(0, 0, source.width, source.height);
          tintContext.globalCompositeOperation = "destination-in";
          tintContext.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
          tinted.set(key, tintCanvas);
        }
        context.drawImage(tintCanvas, -width / 2, -height / 2, width, height);
      } else {
        context.drawImage(image, source.x, source.y, source.width, source.height, -width / 2, -height / 2, width, height);
      }
    } else {
      context.fillStyle = item.assetId === "player" ? "#2acae9" : item.assetId === "wall" ? "#5c6978" : item.assetId === "gem" ? "#ffc432" : "#ff00ff";
      context.fillRect(-width / 2, -height / 2, width, height);
    }
    context.restore();
  }
  context.fillStyle = "#ffffff";
  context.font = `${Math.round(16 * scale)}px sans-serif`;
  context.textBaseline = "top";
  for (const label of frame.hud) {
    context.fillText(label.text, label.x * scale, label.y * scale);
  }
  return canvas.toBuffer("image/png");
}
