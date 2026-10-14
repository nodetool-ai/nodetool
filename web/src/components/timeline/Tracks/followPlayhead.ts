/**
 * Page-scroll for "follow playhead": while playback runs, the lanes stay put
 * until the playhead nears the right edge (or leaves the view on the left, as
 * after a loop wrap), then jump one page so the playhead sits near the left.
 * A jump per page, not a scroll per frame, keeps the ruler, lanes and
 * scrollbar from re-rendering at the frame rate.
 */

/** Fraction of the viewport from the right edge that triggers a page jump. */
const EDGE_FRACTION = 0.05;
/** Fraction of the viewport left of the playhead after a page jump. */
const LEAD_FRACTION = 0.1;

/**
 * The scroll offset that brings the playhead back into view, or null when it
 * is still inside the viewport and the lanes should not move.
 */
export const followScrollLeft = (
  timeMs: number,
  msPerPx: number,
  scrollLeftPx: number,
  viewportWidthPx: number
): number | null => {
  if (viewportWidthPx <= 0 || msPerPx <= 0) {
    return null;
  }
  const playheadPx = timeMs / msPerPx;
  const rightEdgePx =
    scrollLeftPx + viewportWidthPx * (1 - EDGE_FRACTION);
  if (playheadPx >= scrollLeftPx && playheadPx <= rightEdgePx) {
    return null;
  }
  return Math.max(0, playheadPx - viewportWidthPx * LEAD_FRACTION);
};
