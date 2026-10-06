import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import { gameFontFamily } from "../../fonts.js";
export function paintGameHud(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, frame: GameRenderFrame3D): void {
  const { hudWidth, hudHeight } = frame.presentation;
  if (canvas.width !== Math.round(hudWidth) || canvas.height !== Math.round(hudHeight)) {
    canvas.width = Math.round(hudWidth);
    canvas.height = Math.round(hudHeight);
  }
  const context = canvas.getContext("2d");
  if (!context) { throw new Error("HUD Canvas2D context is unavailable"); }
  context.clearRect(0, 0, hudWidth, hudHeight);
  for (const label of frame.hud) {
    context.font = `${label.size ?? 18}px ${label.fontId ? `"${gameFontFamily(frame.gameId, label.fontId)}",` : ""}system-ui,sans-serif`;
    context.fillStyle = label.color ?? "#ffffff";
    context.textAlign = label.align ?? "left";
    context.textBaseline = "top";
    context.fillText(label.text, label.x, label.y);
  }
  texture.needsUpdate = true;
}
