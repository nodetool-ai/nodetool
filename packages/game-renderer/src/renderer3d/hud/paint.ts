import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import { gameFontFamily } from "../../fonts.js";
import { paintGameUi } from "../../ui/paint.js";
import { gameUiViewport3D } from "../../ui/hud3d.js";

interface PaintedHud {
  readonly key: string;
  ui: GameRenderFrame3D["ui"];
  hud: GameRenderFrame3D["hud"];
}

/** What each HUD canvas last painted, so an unchanged HUD skips the repaint and the texture upload. */
const painted = new WeakMap<HTMLCanvasElement, PaintedHud>();

/** Paints the 3D HUD at one canvas pixel per HUD pixel: the widget tree, then the `hud` labels above it. */
export function paintGameHud(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, frame: GameRenderFrame3D): void {
  const { hudWidth, hudHeight } = frame.presentation;
  const sized = canvas.width === Math.round(hudWidth) && canvas.height === Math.round(hudHeight);
  const last = painted.get(canvas);
  // A tick builds its HUD objects once, so frames between ticks reuse them and skip the key.
  if (sized && last && last.ui === frame.ui && last.hud === frame.hud) { return; }
  const key = JSON.stringify([frame.gameId, hudWidth, hudHeight, frame.ui, frame.hud]);
  if (sized && last?.key === key) { last.ui = frame.ui; last.hud = frame.hud; return; }
  painted.set(canvas, { key, ui: frame.ui, hud: frame.hud });
  if (canvas.width !== Math.round(hudWidth) || canvas.height !== Math.round(hudHeight)) {
    canvas.width = Math.round(hudWidth);
    canvas.height = Math.round(hudHeight);
  }
  const context = canvas.getContext("2d");
  if (!context) { throw new Error("HUD Canvas2D context is unavailable"); }
  context.clearRect(0, 0, hudWidth, hudHeight);
  // 3D documents bind no image assets, so image nodes stay empty.
  if (frame.ui) { paintGameUi(context, frame.ui, gameUiViewport3D(frame), { gameId: frame.gameId }); }
  for (const label of frame.hud) {
    context.font = `${label.size ?? 18}px ${label.fontId ? `"${gameFontFamily(frame.gameId, label.fontId)}",` : ""}system-ui,sans-serif`;
    context.fillStyle = label.color ?? "#ffffff";
    context.textAlign = label.align ?? "left";
    context.textBaseline = "top";
    context.fillText(label.text, label.x, label.y);
  }
  texture.needsUpdate = true;
}
