/**
 * True when the primary pointer is touch-like.
 *
 * Read at call time instead of through `useMediaQuery`: the answer is only
 * needed inside an event handler, and a hook would add one media-query
 * subscription per asset tile. `matchMedia` is absent in jsdom.
 */
export const isCoarsePointer = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
