/**
 * Track height helpers
 *
 * Shared constants and computation for track row height. When a track's
 * DSP chain editor is expanded inline the row grows by `FX_PANEL_HEIGHT_PX`
 * so the header (containing the editor) and the lane stay aligned.
 */

export const DEFAULT_TRACK_HEIGHT_PX = 64;
export const FX_PANEL_HEIGHT_PX = 280;

/**
 * Effective rendered height of a track row, including the inline FX panel
 * when expanded.
 */
function trackEffectiveHeight(
  trackHeightPx: number | undefined,
  fxExpanded: boolean
): number {
  return (
    (trackHeightPx ?? DEFAULT_TRACK_HEIGHT_PX) +
    (fxExpanded ? FX_PANEL_HEIGHT_PX : 0)
  );
}
