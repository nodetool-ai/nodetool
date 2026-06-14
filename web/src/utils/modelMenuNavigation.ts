/**
 * Keyboard navigation helpers for the model menu list.
 *
 * Extracted as pure functions so the wrapping / skip-unavailable logic can be
 * unit tested without rendering the virtualized list.
 */

/**
 * Returns the next selectable index when moving from `from` in direction `dir`,
 * wrapping around the ends and skipping rows for which `isAvailable` is false.
 *
 * - `from < 0` means "no current selection": moving down starts at the first
 *   row, moving up starts at the last row.
 * - Returns `from` unchanged when no available row exists.
 */
export const nextAvailableIndex = (
  count: number,
  from: number,
  dir: 1 | -1,
  isAvailable: (index: number) => boolean
): number => {
  if (count <= 0) {
    return -1;
  }
  const start = from < 0 ? (dir === 1 ? -1 : 0) : from;
  for (let step = 1; step <= count; step++) {
    const idx = (((start + dir * step) % count) + count) % count;
    if (isAvailable(idx)) {
      return idx;
    }
  }
  return from;
};

/**
 * Index of the first available row, or -1 when none are available. Used to
 * pre-highlight a row so Enter selects the top-ranked match after typing.
 */
export const firstAvailableIndex = (
  count: number,
  isAvailable: (index: number) => boolean
): number => {
  for (let i = 0; i < count; i++) {
    if (isAvailable(i)) {
      return i;
    }
  }
  return -1;
};
