/**
 * Pure helpers behind the shot grid's drag-to-reorder and arrow-key
 * navigation. Both take the board's shot ids in display order and return
 * what the store should be told; neither reads the DOM.
 */

/**
 * The order after dropping `draggedId` onto `targetId`: the dragged shot
 * takes the target's slot, so dropping on an earlier card lands before it and
 * dropping on a later card lands after it. Unknown ids and a drop on itself
 * return the input untouched.
 */
export const dropShotOrder = (
  ids: readonly string[],
  draggedId: string,
  targetId: string
): string[] => {
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) {
    return [...ids];
  }
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
};

export type ShotNavigationKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

export const isShotNavigationKey = (key: string): key is ShotNavigationKey =>
  key === "ArrowLeft" ||
  key === "ArrowRight" ||
  key === "Home" ||
  key === "End";

/**
 * The shot an arrow or Home/End key lands on from `activeId`. With nothing
 * selected, any key picks the first shot; the arrows stop at the ends rather
 * than wrapping, so holding one parks on the last card. Null on an empty board.
 */
export const navigateShots = (
  ids: readonly string[],
  activeId: string | null,
  key: ShotNavigationKey
): string | null => {
  if (ids.length === 0) {
    return null;
  }
  const current = activeId ? ids.indexOf(activeId) : -1;
  if (key === "Home" || current === -1) {
    return ids[0];
  }
  if (key === "End") {
    return ids[ids.length - 1];
  }
  const step = key === "ArrowLeft" ? -1 : 1;
  const next = Math.min(ids.length - 1, Math.max(0, current + step));
  return ids[next];
};
