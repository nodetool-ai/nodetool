/**
 * Inverse-zoom factors for a group panel's chrome, in world units per screen
 * unit. Zoomed out, the label and outline keep their full screen size so a
 * group stays identifiable in an overview. Zoomed in, the label grows gently
 * (sub-linear exponent) instead of staying tiny.
 */
export interface GroupZoomScale {
  /** Scale for the headline. */
  label: number;
  /** Scale for the hover action buttons, which do not need to read as text. */
  actions: number;
  /** World-space width of a 1px screen-space outline. */
  outlineWidthPx: number;
  /** World-space gap that renders as 5px on screen above the panel. */
  headerGapPx: number;
}

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;

export const groupZoomScale = (zoom: number): GroupZoomScale => {
  const z = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
  return {
    label: z < 1 ? 1 / z : Math.pow(1 / z, 0.8),
    actions: Math.pow(1 / z, 0.55),
    outlineWidthPx: 1 / z,
    headerGapPx: 5 / z
  };
};
