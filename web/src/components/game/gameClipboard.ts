import type { GameEntity } from "@nodetool-ai/protocol/game.js";

/** Copies clipboard entities with fresh IDs, keeping each pasted child under its pasted parent. */
export function pastedEntities(clipboard: readonly GameEntity[], targetEntityIds: readonly string[], newId: () => string): GameEntity[] {
  const ids = new Map(clipboard.map((entity) => [entity.id, newId()]));
  const target = new Set(targetEntityIds);
  return clipboard.map((entity) => {
    const copied = { ...entity, id: ids.get(entity.id) ?? newId(),
      transform2d: { ...entity.transform2d, x: entity.transform2d.x + 0.25, y: entity.transform2d.y + 0.25 } };
    const parentId = entity.parentId ? ids.get(entity.parentId) ?? (target.has(entity.parentId) ? entity.parentId : undefined) : undefined;
    if (parentId) copied.parentId = parentId;
    else delete copied.parentId;
    return copied;
  });
}
