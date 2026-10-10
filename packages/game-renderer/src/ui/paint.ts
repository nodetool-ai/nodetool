import type { GameUiFrame } from "@nodetool-ai/protocol";
import { gameFontFamily } from "../fonts.js";
import { GAME_UI_TEXT_SIZE, layoutGameUi, type GameUiBox, type GameUiInsets, type GameUiMeasureText, type GameUiViewport } from "./layout.js";

/** The Canvas2D calls the HUD painter makes. Browser, OffscreenCanvas and @napi-rs/canvas contexts all provide them. */
export interface GameUiPaintContext {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textBaseline: string;
  textAlign: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  roundRect(x: number, y: number, width: number, height: number, radius: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { readonly width: number };
  drawImage(image: never, x: number, y: number, width: number, height: number): void;
}

export interface GameUiPaintOptions {
  /** Output pixels per HUD pixel. */
  readonly scale?: number;
  readonly gameId?: string;
  /** Loaded HUD images by asset id. A missing image leaves its node empty. */
  readonly images?: ReadonlyMap<string, unknown>;
  readonly insets?: GameUiInsets;
}

const PANEL = "#1b1f2a";
const BAR_FILL = "#4caf50";
const BAR_TRACK = "#1b1f2a";
const BUTTON = "#2b3445";
const TEXT = "#ffffff";
const FOCUS = "#ffffff";

/** The CSS font of HUD text, the same weight and fallback stack as `hud` labels. */
export function gameUiFont(size: number, fontId: string | undefined, gameId: string | undefined): string {
  const family = fontId && gameId ? `"${gameFontFamily(gameId, fontId)}", ` : "";
  return `600 ${size}px ${family}system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/** Measures HUD text with a Canvas2D context, so layout and painting agree on text widths. */
export function canvasGameUiMeasure(context: Pick<GameUiPaintContext, "font" | "measureText">, gameId: string | undefined): GameUiMeasureText {
  return (text, size, fontId) => {
    context.font = gameUiFont(size, fontId, gameId);
    return context.measureText(text).width;
  };
}

/** Asset ids of the images a HUD tree draws, for the renderer to load before painting. */
export function gameUiImageIds(ui: GameUiFrame | undefined): string[] {
  return [...new Set((ui?.nodes ?? []).flatMap((node) => node.kind === "image" && node.visible !== false ? [node.assetId] : []))];
}

/**
 * Lays out and paints a HUD tree onto a Canvas2D context whose origin is the HUD rectangle's top-left corner.
 * Returns the boxes it drew, in HUD pixels.
 */
export function paintGameUi(context: GameUiPaintContext, ui: GameUiFrame, viewport: GameUiViewport, options: GameUiPaintOptions = {}): GameUiBox[] {
  const boxes = layoutGameUi(ui, viewport, canvasGameUiMeasure(context, options.gameId), ui.insets ?? options.insets);
  context.save();
  const scale = options.scale ?? 1;
  if (scale !== 1) { context.scale(scale, scale); }
  for (const box of boxes) {
    context.globalAlpha = box.opacity;
    paintBox(context, box, options, box.node.id === ui.focusId);
  }
  context.restore();
  return boxes;
}

function rect(context: GameUiPaintContext, x: number, y: number, width: number, height: number, radius: number): void {
  if (radius > 0) {
    context.beginPath();
    context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
    context.fill();
  } else {
    context.fillRect(x, y, width, height);
  }
}

function paintText(context: GameUiPaintContext, text: string, x: number, y: number, size: number, fontId: string | undefined,
  color: string, align: "left" | "center" | "right", baseline: "top" | "middle", gameId: string | undefined): void {
  context.font = gameUiFont(size, fontId, gameId);
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = baseline;
  context.fillText(text, x, y);
}

function paintBox(context: GameUiPaintContext, box: GameUiBox, options: GameUiPaintOptions, focused: boolean): void {
  const { node, x, y, width, height } = box;
  switch (node.kind) {
    case "panel": {
      context.fillStyle = node.color ?? PANEL;
      rect(context, x, y, width, height, node.cornerRadius ?? 0);
      return;
    }
    case "image": {
      const image = options.images?.get(node.assetId);
      if (image) { context.drawImage(image as never, x, y, width, height); }
      return;
    }
    case "text": {
      const align = node.align ?? "left";
      const anchorX = align === "left" ? x : align === "center" ? x + width / 2 : x + width;
      paintText(context, node.text, anchorX, y, node.size ?? GAME_UI_TEXT_SIZE, node.fontId, node.color ?? TEXT, align, "top", options.gameId);
      return;
    }
    case "bar": {
      context.fillStyle = node.background ?? BAR_TRACK;
      context.fillRect(x, y, width, height);
      const max = node.max ?? 1;
      const fraction = Math.max(0, Math.min(1, (node.value ?? 0) / max));
      context.fillStyle = node.color ?? BAR_FILL;
      switch (node.direction ?? "leftToRight") {
        case "leftToRight": context.fillRect(x, y, width * fraction, height); break;
        case "rightToLeft": context.fillRect(x + width * (1 - fraction), y, width * fraction, height); break;
        case "bottomToTop": context.fillRect(x, y + height * (1 - fraction), width, height * fraction); break;
        case "topToBottom": context.fillRect(x, y, width, height * fraction); break;
      }
      return;
    }
    case "button": {
      context.fillStyle = node.background ?? BUTTON;
      rect(context, x, y, width, height, Math.min(8, height / 4));
      if (node.text) {
        paintText(context, node.text, x + width / 2, y + height / 2, node.size ?? GAME_UI_TEXT_SIZE, node.fontId, node.color ?? TEXT, "center", "middle", options.gameId);
      }
      if (focused) {
        context.strokeStyle = FOCUS;
        context.lineWidth = 2;
        context.strokeRect(x - 2, y - 2, width + 4, height + 4);
      }
      return;
    }
    case "stack":
    case "grid":
      return;
  }
}
