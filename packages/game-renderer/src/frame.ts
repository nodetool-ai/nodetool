import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { gameFontFamily } from "./fonts.js";

export type RenderItem = GameRenderFrame["sprites"][number] | GameRenderFrame["tiles"][number];

export interface VisibleItem {
  readonly item: RenderItem;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly assetId: string;
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined;
  readonly tint: string | undefined;
  readonly opacity: number;
  readonly blend: "normal" | "additive";
  readonly sampling: "nearest" | "linear";
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly unlit: boolean;
  /** Tiles and background tiles snap to whole pixels so neighbors meet without antialiased seams. */
  readonly snap: boolean;
}

/** A drawing rectangle by pixel center and size, snapped to whole pixels when the item asks for it. */
export function pixelRect(item: VisibleItem, x: number, y: number, width: number, height: number):
  { x: number; y: number; width: number; height: number } {
  if (!item.snap) return { x, y, width, height };
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height / 2);
  const snappedWidth = Math.round(x + width / 2) - left;
  const snappedHeight = Math.round(y + height / 2) - top;
  return { x: left + snappedWidth / 2, y: top + snappedHeight / 2, width: snappedWidth, height: snappedHeight };
}

/** Camera projection for the sample between the previous and current tick. */
export function projectedCamera(frame: GameRenderFrame, interpolation: number): { x: number; y: number; zoom: number } {
  const alpha = Math.max(0, Math.min(1, interpolation));
  return { x: (frame.camera.previousX ?? frame.camera.x) * (1 - alpha) + frame.camera.x * alpha,
    y: (frame.camera.previousY ?? frame.camera.y) * (1 - alpha) + frame.camera.y * alpha, zoom: frame.camera.zoom };
}

export function interpolateTint(previous: string | undefined, current: string | undefined, alpha: number): string | undefined {
  if (!previous || !current || !/^#[0-9a-fA-F]{6}$/.test(previous) || !/^#[0-9a-fA-F]{6}$/.test(current)) return current;
  return `#${[1, 3, 5].map((index) => Math.round(Number.parseInt(previous.slice(index, index + 2), 16) * (1 - alpha) +
    Number.parseInt(current.slice(index, index + 2), 16) * alpha).toString(16).padStart(2, "0")).join("")}`;
}

export function visibleItems(frame: GameRenderFrame, interpolation: number, overscanWorld = 0): VisibleItem[] {
  const alpha = Math.max(0, Math.min(1, interpolation));
  const camera = projectedCamera(frame, alpha);
  const scale = camera.zoom;
  if (!Number.isFinite(scale) || scale <= 0) {
    return [];
  }
  const halfWidth = frame.width / (2 * scale) + overscanWorld;
  const halfHeight = frame.height / (2 * scale) + overscanWorld;
  const items: VisibleItem[] = [];
  function add(item: RenderItem, x: number, y: number, width: number, height: number, rotation: number,
    opacity = item.opacity ?? 1, tint = item.tint, flipX = false, flipY = false, snap = false): void {
    const radius = Math.hypot(width, height) / 2;
    if (x + radius < camera.x - halfWidth || x - radius > camera.x + halfWidth ||
        y + radius < camera.y - halfHeight || y - radius > camera.y + halfHeight) {
      return;
    }
    items.push({
      item,
      x,
      y,
      width,
      height,
      rotation,
      assetId: item.assetId,
      frame: item.frame,
      tint: tint && /^#[0-9a-fA-F]{6}$/.test(tint) ? tint : undefined,
      opacity,
      blend: "blend" in item && item.blend === "additive" ? "additive" : "normal",
      sampling: item.sampling ?? "nearest",
      flipX,
      flipY,
      unlit: "unlit" in item && item.unlit === true,
      snap,
    });
  }
  for (const layer of frame.backgrounds ?? []) {
    const time = Math.max(0, frame.tick - 1 + alpha) / 60;
    const period = layer.mode === "mirror" ? 2 : 1;
    const scrollX = layer.scrollRate.x * time;
    const scrollY = layer.scrollRate.y * time;
    const baseX = layer.origin.x + (layer.mode === "none" ? scrollX : scrollX % (layer.width * period)) + camera.x * (1 - layer.parallax.x);
    const baseY = layer.origin.y + (layer.mode === "none" || layer.mode === "repeatX" ? scrollY : scrollY % (layer.height * period)) + camera.y * (1 - layer.parallax.y);
    const minX = layer.mode === "none" ? 0 : Math.floor((camera.x - halfWidth - baseX) / layer.width);
    const maxX = layer.mode === "none" ? 0 : Math.ceil((camera.x + halfWidth - baseX) / layer.width);
    // A repeatX layer tiles sideways only, so a strip of scenery never stacks above itself.
    const tilesY = layer.mode === "repeat" || layer.mode === "mirror";
    const minY = tilesY ? Math.floor((camera.y - halfHeight - baseY) / layer.height) : 0;
    const maxY = tilesY ? Math.ceil((camera.y + halfHeight - baseY) / layer.height) : 0;
    if ((maxX - minX + 1) * (maxY - minY + 1) > 4096) throw new Error(`Background ${layer.id} exceeds 4096 visible tiles`);
    for (let iy = minY; iy <= maxY; iy += 1) {
      for (let ix = minX; ix <= maxX; ix += 1) {
        const item: GameRenderFrame["sprites"][number] = { entityId: layer.id, assetId: layer.assetId,
          x: baseX + ix * layer.width, y: baseY + iy * layer.height, previousX: baseX + ix * layer.width,
          previousY: baseY + iy * layer.height, rotation: 0, scaleX: 1, scaleY: 1,
          width: layer.width, height: layer.height, layer: layer.layer };
        if (layer.frame) item.frame = layer.frame;
        if (layer.sampling) item.sampling = layer.sampling;
        add(item, item.x, item.y, item.width, item.height, 0, 1, undefined,
          layer.mode === "mirror" && Math.abs(ix % 2) === 1, layer.mode === "mirror" && Math.abs(iy % 2) === 1, true);
      }
    }
  }
  for (const item of frame.tiles) {
    add(item, item.x, item.y, item.width, item.height, 0, item.opacity ?? 1, item.tint, false, false, true);
  }
  for (const item of frame.sprites) {
    add(item, item.previousX + (item.x - item.previousX) * alpha,
      item.previousY + (item.y - item.previousY) * alpha,
      item.width * ((item.previousScaleX ?? item.scaleX) * (1 - alpha) + item.scaleX * alpha),
      item.height * ((item.previousScaleY ?? item.scaleY) * (1 - alpha) + item.scaleY * alpha),
      (item.previousRotation ?? item.rotation) * (1 - alpha) + item.rotation * alpha,
      (item.previousOpacity ?? item.opacity ?? 1) * (1 - alpha) + (item.opacity ?? 1) * alpha,
      interpolateTint(item.previousTint, item.tint, alpha), item.flipX === true);
  }
  items.sort((a, b) => a.item.layer - b.item.layer);
  return items;
}

export function parseTint(tint: string | undefined): readonly [number, number, number] {
  if (!tint || !/^#[0-9a-fA-F]{6}$/.test(tint)) {
    return [1, 1, 1];
  }
  return [
    Number.parseInt(tint.slice(1, 3), 16) / 255,
    Number.parseInt(tint.slice(3, 5), 16) / 255,
    Number.parseInt(tint.slice(5, 7), 16) / 255,
  ];
}

/** The subset of a 2D canvas context that HUD painting needs, shared by DOM and headless canvases. */
export interface HudContext {
  fillStyle: unknown;
  font: string;
  textBaseline: string;
  textAlign: string;
  shadowColor: string;
  shadowBlur: number;
  fillText(text: string, x: number, y: number): void;
}

/** Paint HUD labels in canvas pixels. Coordinates and sizes scale with the output. */
export function paintHud(context: HudContext, hud: GameRenderFrame["hud"], scale = 1, gameId = ""): void {
  context.textBaseline = "top";
  context.shadowColor = "rgba(0, 0, 0, 0.6)";
  for (const label of hud) {
    const size = (label.size ?? 16) * scale;
    const family = label.fontId && gameId ? `"${gameFontFamily(gameId, label.fontId)}", ` : "";
    context.font = `600 ${Math.round(size)}px ${family}system-ui, -apple-system, "Segoe UI", sans-serif`;
    context.textAlign = label.align ?? "left";
    context.fillStyle = label.color ?? "#ffffff";
    context.shadowBlur = size / 4;
    context.fillText(label.text, label.x * scale, label.y * scale);
  }
  context.shadowBlur = 0;
  context.textAlign = "left";
}
