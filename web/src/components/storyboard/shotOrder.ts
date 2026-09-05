/**
 * Pure helpers behind the shot grid's drag-to-reorder and arrow-key
 * navigation. Both take the board's shot ids in display order and return
 * what the store should be told; neither reads the DOM.
 */

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
