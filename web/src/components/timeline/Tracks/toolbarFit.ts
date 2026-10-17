/**
 * Whether the tracks toolbar should switch to its compact (icon-only)
 * controls. The labelled toolbar measures how wide it needs to be when it
 * overflows; it stays compact until the toolbar is that wide again, so the
 * switch cannot flicker between the two layouts.
 */
export interface ToolbarFit {
  narrow: boolean;
  /** Width the labelled controls needed the last time they overflowed. */
  neededWidthPx: number;
}

export function nextToolbarFit(
  current: ToolbarFit,
  clientWidthPx: number,
  scrollWidthPx: number
): ToolbarFit {
  if (clientWidthPx <= 0) return current;
  if (!current.narrow) {
    return scrollWidthPx > clientWidthPx
      ? { narrow: true, neededWidthPx: scrollWidthPx }
      : current;
  }
  return clientWidthPx >= current.neededWidthPx
    ? { narrow: false, neededWidthPx: current.neededWidthPx }
    : current;
}
