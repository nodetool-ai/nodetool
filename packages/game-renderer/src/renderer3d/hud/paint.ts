import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import { gameFontFamily } from "../../fonts.js";
import { paintGameUi } from "../../ui/paint.js";
import { gameUiViewport3D } from "../../ui/hud3d.js";

/** Paints the 3D HUD at one canvas pixel per HUD pixel: the widget tree, then the `hud` labels above it. */
export function paintGameHud(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, frame: GameRenderFrame3D): void {
  const { hudWidth, hudHeight } = frame.presentation;
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
