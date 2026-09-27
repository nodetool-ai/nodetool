import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { paintHud, projectedCamera, visibleItems } from "./frame.js";
import { applyLighting, spritePixelBounds } from "./lighting.js";
import { gameFontFamily } from "./fonts.js";
import { applyGpuEffects } from "./gpu-capture.js";
import type { GameHudEffectOrder, GameRendererEffect } from "./index.js";

export interface CaptureGameFrameOptions {
  readonly resolveAsset?: (assetId: string) => Promise<Uint8Array | null>;
  readonly interpolation?: number;
  readonly scale?: number;
  readonly onDiagnostic?: (message: string) => void;
  readonly backend?: "canvas2d" | "webgpu";
  readonly effects?: readonly GameRendererEffect[];
  readonly hudEffectOrder?: GameHudEffectOrder;
}

/** Renders one frame to PNG with an explicit Canvas2D or GPU effect path. */
export async function captureGameFrame(frame: GameRenderFrame, options: CaptureGameFrameOptions = {}): Promise<Uint8Array> {
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Capture scale must be positive");
  }
  const effects = options.effects ?? [];
  const backend = options.backend ?? "canvas2d";
  if (backend !== "canvas2d" && backend !== "webgpu") throw new Error(`Unknown capture backend ${backend}`);
  if (backend === "canvas2d" && effects.some((effect) => effect.required)) {
    throw new Error("Required GPU effect is unavailable in Canvas2D capture; choose the webgpu backend");
  }
  if (backend === "canvas2d" && effects.length > 0) options.onDiagnostic?.("Optional GPU effects omitted in Canvas2D capture");
  const outputWidth = Math.max(1, Math.round(frame.width * frame.pixelsPerUnit * scale));
  const outputHeight = Math.max(1, Math.round(frame.height * frame.pixelsPerUnit * scale));
  const overscan = backend === "webgpu" ? Math.ceil(effects.reduce((maximum, effect) =>
    effect.kind === "bloom" ? Math.max(maximum, effect.radius) : maximum, 0) * 2) : 0;
  const canvas = createCanvas(outputWidth + overscan * 2, outputHeight + overscan * 2);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  const pixelScaleForCulling = frame.pixelsPerUnit * frame.camera.zoom * scale;
  const items = visibleItems(frame, options.interpolation ?? 1, overscan / pixelScaleForCulling);
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
  const camera = projectedCamera(frame, options.interpolation ?? 1);
  const drawIndex = (index: number, drawContext = context, normalBlend = false): void => {
    const item = items[index];
    if (!item) {
      return;
    }
    const image = images[index];
    const x = canvas.width / 2 + (item.x - camera.x) * pixelScale;
    const y = canvas.height / 2 - (item.y - camera.y) * pixelScale;
    const width = item.width * pixelScale;
    const height = item.height * pixelScale;
    drawContext.save();
    drawContext.translate(x, y);
    drawContext.rotate(-item.rotation);
    drawContext.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
    drawContext.globalAlpha = item.opacity;
    drawContext.globalCompositeOperation = !normalBlend && item.blend === "additive" ? "lighter" : "source-over";
    drawContext.imageSmoothingEnabled = item.sampling === "linear";
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
        drawContext.drawImage(tintCanvas, -width / 2, -height / 2, width, height);
      } else {
        drawContext.drawImage(image, source.x, source.y, source.width, source.height, -width / 2, -height / 2, width, height);
      }
    } else {
      drawContext.fillStyle = item.assetId === "player" ? "#2acae9" : item.assetId === "wall" ? "#5c6978" : item.assetId === "gem" ? "#ffc432" : "#ff00ff";
      drawContext.fillRect(-width / 2, -height / 2, width, height);
    }
    drawContext.restore();
  };
  const lightCanvas = frame.lighting ? createCanvas(canvas.width, canvas.height) : undefined;
  const lightContext = lightCanvas?.getContext("2d");
  const lightingFrame = overscan === 0 ? frame : { ...frame,
    width: frame.width * canvas.width / outputWidth, height: frame.height * canvas.height / outputHeight };
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    if (!lightCanvas || !lightContext || item.unlit) {
      drawIndex(index);
      continue;
    }
    const x = canvas.width / 2 + (item.x - camera.x) * pixelScale;
    const y = canvas.height / 2 - (item.y - camera.y) * pixelScale;
    const bounds = spritePixelBounds(x, y, item.width * pixelScale, item.height * pixelScale,
      item.rotation, canvas.width, canvas.height);
    if (!bounds) continue;
    lightContext.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    drawIndex(index, lightContext, true);
    const pixels = lightContext.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    applyLighting(pixels.data, bounds.width, bounds.height, lightingFrame, options.interpolation ?? 1,
      { viewportWidth: canvas.width, viewportHeight: canvas.height, x: bounds.x, y: bounds.y });
    // The canvas records drawImage by reference and replays it at encode time, so each
    // lit sprite composites from its own canvas rather than the reused light buffer.
    const lit = createCanvas(bounds.width, bounds.height);
    lit.getContext("2d").putImageData(pixels, 0, 0);
    context.save();
    context.globalCompositeOperation = item.blend === "additive" ? "lighter" : "source-over";
    context.imageSmoothingEnabled = false;
    context.drawImage(lit, bounds.x, bounds.y);
    context.restore();
  }
  const registered: NonNullable<ReturnType<typeof GlobalFonts.register>>[] = [];
  try {
    for (const [fontId, binding] of Object.entries(frame.fonts ?? {})) {
      const family = gameFontFamily(frame.gameId ?? "", fontId);
      try {
        const bytes = await options.resolveAsset?.(fontId);
        if (!bytes) throw new Error("asset is missing");
        const key = GlobalFonts.register(Buffer.from(bytes), family);
        if (!key) throw new Error("invalid font bytes");
        registered.push(key);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (binding.required !== false) throw new Error(`Required font ${fontId} could not load: ${detail}`);
        options.onDiagnostic?.(`Optional font ${fontId} could not load; using system font`);
      }
    }
    const hudOrder = options.hudEffectOrder ?? (effects.some((effect) => effect.kind === "bloom") ? "afterEffects" : "beforeEffects");
    const applyEffects = backend === "webgpu" && effects.length > 0;
    if (!applyEffects || hudOrder === "beforeEffects") {
      context.save();
      context.translate(overscan, overscan);
      paintHud(context, frame.hud, scale, frame.gameId);
      context.restore();
    }
    if (applyEffects) {
      try {
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        image.data.set(await applyGpuEffects(image.data, canvas.width, canvas.height, effects, options.resolveAsset, options.onDiagnostic));
        context.putImageData(image, 0, 0);
      } catch (error) {
        if (effects.some((effect) => effect.required)) throw new Error("Required GPU capture effect failed", { cause: error });
        options.onDiagnostic?.(`Optional GPU effects omitted in capture: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (overscan === 0) {
      if (applyEffects && hudOrder === "afterEffects") paintHud(context, frame.hud, scale, frame.gameId);
      return canvas.toBuffer("image/png");
    }
    const cropped = createCanvas(outputWidth, outputHeight);
    const croppedContext = cropped.getContext("2d");
    croppedContext.drawImage(canvas, overscan, overscan, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight);
    if (applyEffects && hudOrder === "afterEffects") paintHud(croppedContext, frame.hud, scale, frame.gameId);
    return cropped.toBuffer("image/png");
  } finally {
    GlobalFonts.removeBatch(registered);
  }
}
