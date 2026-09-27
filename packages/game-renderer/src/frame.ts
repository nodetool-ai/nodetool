import type { GameRenderFrame } from "@nodetool-ai/protocol";

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
}

export function visibleItems(frame: GameRenderFrame, interpolation: number): VisibleItem[] {
  const alpha = Math.max(0, Math.min(1, interpolation));
  const scale = frame.camera.zoom;
  if (!Number.isFinite(scale) || scale <= 0) {
    return [];
  }
  const halfWidth = frame.width / (2 * scale);
  const halfHeight = frame.height / (2 * scale);
  const items: VisibleItem[] = [];
  function add(item: RenderItem, x: number, y: number, width: number, height: number, rotation: number): void {
    const radius = Math.hypot(width, height) / 2;
    if (x + radius < frame.camera.x - halfWidth || x - radius > frame.camera.x + halfWidth ||
        y + radius < frame.camera.y - halfHeight || y - radius > frame.camera.y + halfHeight) {
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
      tint: "tint" in item && item.tint && /^#[0-9a-fA-F]{6}$/.test(item.tint) ? item.tint : undefined,
      opacity: item.opacity ?? 1,
      blend: "blend" in item && item.blend === "additive" ? "additive" : "normal",
      sampling: item.sampling ?? "nearest",
    });
  }
  for (const item of frame.tiles) {
    add(item, item.x, item.y, item.width, item.height, 0);
  }
  for (const item of frame.sprites) {
    add(item, item.previousX + (item.x - item.previousX) * alpha,
      item.previousY + (item.y - item.previousY) * alpha,
      item.width * item.scaleX, item.height * item.scaleY, item.rotation);
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
export function paintHud(context: HudContext, hud: GameRenderFrame["hud"], scale = 1): void {
  context.textBaseline = "top";
  context.shadowColor = "rgba(0, 0, 0, 0.6)";
  for (const label of hud) {
    const size = (label.size ?? 16) * scale;
    context.font = `600 ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    context.textAlign = label.align ?? "left";
    context.fillStyle = label.color ?? "#ffffff";
    context.shadowBlur = size / 4;
    context.fillText(label.text, label.x * scale, label.y * scale);
  }
  context.shadowBlur = 0;
  context.textAlign = "left";
}
