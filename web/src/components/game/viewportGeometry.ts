import type { GameRenderFrame, GameScene } from "@nodetool-ai/protocol/game.js";
import { projectedCamera } from "@nodetool-ai/game-renderer";

type Sprite = GameRenderFrame["sprites"][number];

export function worldPoint(x: number, y: number, frame: GameRenderFrame, width: number, height: number): { x: number; y: number } {
  const camera = projectedCamera(frame, 1);
  const scale = camera.zoom * frame.pixelsPerUnit;
  return { x: camera.x + (x - width / 2) / scale,
    y: camera.y - (y - height / 2) / scale };
}

/** Test a world point against rotated sprite bounds in descending layer order. */
export function hitSprites(frame: GameRenderFrame, x: number, y: number): GameRenderFrame["sprites"] {
  const sprites = [...frame.sprites].sort((a, b) => b.layer - a.layer);
  return sprites.filter((sprite) => {
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    const cosine = Math.cos(sprite.rotation);
    const sine = Math.sin(sprite.rotation);
    const localX = dx * cosine + dy * sine;
    const localY = -dx * sine + dy * cosine;
    if (Math.abs(localX) <= sprite.width * sprite.scaleX / 2 && Math.abs(localY) <= sprite.height * sprite.scaleY / 2) {
      return true;
    }
    return false;
  });
}

export function hitSprite(frame: GameRenderFrame, x: number, y: number): GameRenderFrame["sprites"][number] | null {
  return hitSprites(frame, x, y)[0] ?? null;
}

export function hitEntityIcons(scene: GameScene, frame: GameRenderFrame, x: number, y: number): GameScene["entities"] {
  const visibleSprites = new Set(frame.sprites.map((sprite) => sprite.entityId));
  const scale = frame.camera.zoom * frame.pixelsPerUnit;
  return scene.entities.filter((entity) => !visibleSprites.has(entity.id) &&
    Math.hypot((entity.transform2d.x - x) * scale, (entity.transform2d.y - y) * scale) <= 8).reverse();
}

export function spriteHandle(sprite: Sprite, kind: "scale" | "rotate"): { x: number; y: number } {
  const localX = kind === "scale" ? sprite.width * sprite.scaleX / 2 : 0;
  const localY = sprite.height * sprite.scaleY / 2 + (kind === "rotate" ? 0.6 : 0);
  const cosine = Math.cos(sprite.rotation);
  const sine = Math.sin(sprite.rotation);
  return { x: sprite.x + localX * cosine - localY * sine,
    y: sprite.y + localX * sine + localY * cosine };
}

export function spriteScaleAt(sprite: Sprite, x: number, y: number, keepAspect: boolean): { scaleX: number; scaleY: number } {
  const dx = x - sprite.x;
  const dy = y - sprite.y;
  const cosine = Math.cos(sprite.rotation);
  const sine = Math.sin(sprite.rotation);
  const scaleX = Math.max(0.01, Math.abs((dx * cosine + dy * sine) * 2 / sprite.width));
  const scaleY = Math.max(0.01, Math.abs((-dx * sine + dy * cosine) * 2 / sprite.height));
  if (!keepAspect) return { scaleX, scaleY };
  const factor = Math.max(scaleX / sprite.scaleX, scaleY / sprite.scaleY);
  return { scaleX: Math.max(0.01, sprite.scaleX * factor), scaleY: Math.max(0.01, sprite.scaleY * factor) };
}

export function spriteRotationAt(sprite: Sprite, x: number, y: number, snap: boolean): number {
  const rotation = Math.atan2(y - sprite.y, x - sprite.x) - Math.PI / 2;
  if (!snap) return rotation;
  const increment = Math.PI / 12;
  return Math.round(rotation / increment) * increment;
}
