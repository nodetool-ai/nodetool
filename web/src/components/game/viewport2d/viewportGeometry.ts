import type { GameEntity, GameRenderFrame, GameScene } from "@nodetool-ai/protocol/game.js";
import { projectedCamera } from "@nodetool-ai/game-renderer";

type Sprite = GameRenderFrame["sprites"][number];

type Transform = GameEntity["transform2d"];

export function worldTransforms(scene: GameScene): Map<string, Transform> {
  const result = new Map<string, Transform>();
  const children = new Map<string, GameEntity[]>();
  const queue: GameEntity[] = [];
  for (const entity of scene.entities) {
    if (!entity.parentId) queue.push(entity);
    else {
      const siblings = children.get(entity.parentId) ?? [];
      siblings.push(entity);
      children.set(entity.parentId, siblings);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const entity = queue[head];
    const local = entity.transform2d;
    const parent = entity.parentId ? result.get(entity.parentId) : undefined;
    const cosine = Math.cos(parent?.rotation ?? 0);
    const sine = Math.sin(parent?.rotation ?? 0);
    const x = local.x * (parent?.scaleX ?? 1);
    const y = local.y * (parent?.scaleY ?? 1);
    result.set(entity.id, { x: (parent?.x ?? 0) + x * cosine - y * sine,
      y: (parent?.y ?? 0) + x * sine + y * cosine,
      rotation: (parent?.rotation ?? 0) + local.rotation,
      scaleX: (parent?.scaleX ?? 1) * local.scaleX, scaleY: (parent?.scaleY ?? 1) * local.scaleY });
    queue.push(...(children.get(entity.id) ?? []));
  }
  return result;
}

export function localTransform(scene: GameScene, parentId: string | undefined, world: Transform, transforms = worldTransforms(scene)): Transform {
  const parent = parentId ? transforms.get(parentId) : undefined;
  if (!parent) return { ...world };
  const x = world.x - parent.x;
  const y = world.y - parent.y;
  const cosine = Math.cos(parent.rotation);
  const sine = Math.sin(parent.rotation);
  return { x: (x * cosine + y * sine) / parent.scaleX, y: (-x * sine + y * cosine) / parent.scaleY,
    rotation: world.rotation - parent.rotation, scaleX: world.scaleX / parent.scaleX, scaleY: world.scaleY / parent.scaleY };
}

export function selectionRoots(scene: GameScene, selectedIds: readonly string[]): GameEntity[] {
  const selected = new Set(selectedIds);
  const children = new Map<string, GameEntity[]>();
  const ids = new Set(scene.entities.map(entity => entity.id));
  const queue: { entity: GameEntity; selectedAncestor: boolean }[] = [];
  for (const entity of scene.entities) {
    if (!entity.parentId || !ids.has(entity.parentId)) queue.push({ entity, selectedAncestor: false });
    else {
      const siblings = children.get(entity.parentId) ?? [];
      siblings.push(entity);
      children.set(entity.parentId, siblings);
    }
  }
  const roots = new Set<string>();
  for (let head = 0; head < queue.length; head += 1) {
    const { entity, selectedAncestor } = queue[head];
    const isSelected = selected.has(entity.id);
    if (isSelected && !selectedAncestor) roots.add(entity.id);
    for (const child of children.get(entity.id) ?? []) queue.push({ entity: child, selectedAncestor: selectedAncestor || isSelected });
  }
  return scene.entities.filter(entity => roots.has(entity.id));
}

export function reparentTransform(scene: GameScene, entityId: string, parentId: string | undefined): Transform | undefined {
  const world = worldTransforms(scene).get(entityId);
  return world ? localTransform(scene, parentId, world) : undefined;
}

export function selectionDescendants(scene: GameScene, ids: readonly string[]): Set<string> {
  const descendants = new Set(ids);
  const children = new Map<string, string[]>();
  for (const entity of scene.entities) if (entity.parentId) {
    const siblings = children.get(entity.parentId) ?? [];
    siblings.push(entity.id);
    children.set(entity.parentId, siblings);
  }
  const queue = [...ids];
  for (let head = 0; head < queue.length; head += 1) for (const id of children.get(queue[head]) ?? []) {
    if (!descendants.has(id)) { descendants.add(id); queue.push(id); }
  }
  return descendants;
}

export function parentCandidates(scene: GameScene, entityId: string): GameEntity[] {
  const descendants = selectionDescendants(scene, [entityId]);
  return scene.entities.filter(entity => !descendants.has(entity.id));
}

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
  const transforms = worldTransforms(scene);
  return scene.entities.filter((entity) => {
    const transform = transforms.get(entity.id);
    return transform && !visibleSprites.has(entity.id) &&
      Math.hypot((transform.x - x) * scale, (transform.y - y) * scale) <= 8;
  }).reverse();
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
