/**
 * Where a dragged card lands, expressed as the arguments `moveShot` takes.
 *
 * The grid drags one card onto another. It used to rewrite a flat list, but a
 * board is grouped under scene headers now, so a drop that crosses a header
 * changes the shot's `scene_id` — and that is `moveShot(shotId, sceneId,
 * position)`, not a reorder (PRD § 7.7.3).
 *
 * The dragged shot takes the target's slot, which keeps the feel the flat grid
 * had: dropping on an earlier card lands before it, dropping on a later card
 * lands after it. `position` counts inside the target scene *after* the dragged
 * shot has been taken out, because that is the list `moveShot` splices into.
 */

import type { SceneGroup } from "../../lib/storyboard/sceneOrder";

/** A drop resolved against the board's scenes. */
export interface SceneDrop {
  /** `null` is the implicit header a legacy board's shots sit under. */
  sceneId: string | null;
  /** Index within the target scene, after the dragged shot is removed. */
  position: number;
}

/**
 * The scene and position a drop of `draggedId` onto `targetId` means, or null
 * when either id is not on the board or the card was dropped on itself.
 *
 * One pass over the groups: the board calls this per drop, not per card.
 */
export function sceneDropTarget(
  groups: readonly SceneGroup[],
  draggedId: string,
  targetId: string
): SceneDrop | null {
  if (draggedId === targetId) {
    return null;
  }
  let flat = 0;
  let draggedFlat = -1;
  let targetFlat = -1;
  let draggedGroup: SceneGroup | null = null;
  let targetGroup: SceneGroup | null = null;
  let targetPosition = -1;
  for (const group of groups) {
    for (let i = 0; i < group.shots.length; i++, flat++) {
      const id = group.shots[i].id;
      if (id === draggedId) {
        draggedFlat = flat;
        draggedGroup = group;
      }
      if (id === targetId) {
        targetFlat = flat;
        targetGroup = group;
        targetPosition = i;
      }
    }
  }
  if (draggedFlat === -1 || targetGroup === null) {
    return null;
  }
  // Dragging forward: the shot lands after the target. Within the same scene
  // removing it already shifted the target down one, so the index is the
  // target's own; from another scene nothing shifted, so it is one past it.
  const after =
    draggedFlat < targetFlat && draggedGroup !== targetGroup ? 1 : 0;
  return { sceneId: targetGroup.sceneId, position: targetPosition + after };
}
