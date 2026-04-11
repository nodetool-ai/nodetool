/**
 * gizmoConstants – Shared styling and sizing constants for all gizmo overlays.
 *
 * Centralizes colors, line widths, handle sizes, and dash patterns so
 * TransformTool, MoveTool, CropTool, and future gizmo consumers use
 * consistent visual language without scattering magic values.
 *
 * @module tools/gizmo/gizmoConstants
 */

// ─── Handle sizing ───────────────────────────────────────────────────────────

/** Screen-space size of a square handle (CSS px, before DPR scaling). */
export const HANDLE_SIZE = 8;

/** Screen-space hit-test radius for handles (CSS px). */
export const HANDLE_HIT_RADIUS = 8;

/** Distance (CSS px) of the rotation handle above the top edge. */
export const ROTATION_HANDLE_OFFSET = 24;

/** Radius multiplier for the rotation handle circle relative to HANDLE_SIZE. */
export const ROTATION_HANDLE_RADIUS_FACTOR = 0.7;

/**
 * Distance (CSS px) outside the bounding box that still counts as the
 * "rotate zone" — clicking/hovering in this margin triggers rotation
 * instead of returning null.
 */
export const OUTSIDE_ROTATE_MARGIN = 20;

// ─── Colors ──────────────────────────────────────────────────────────────────

/** Primary gizmo accent color (transform bounding box, handle strokes). */
export const GIZMO_PRIMARY_COLOR = "rgba(0, 120, 255, 1)";

/** Semi-transparent primary (bounding box lines, connecting lines). */
export const GIZMO_PRIMARY_SEMI = "rgba(0, 120, 255, 0.8)";

/** Faint primary (connecting lines, subtle elements). */
export const GIZMO_PRIMARY_FAINT = "rgba(0, 120, 255, 0.6)";

/** Handle fill color (default / non-hovered). */
export const HANDLE_FILL_DEFAULT = "#ffffff";

/** Handle fill color when hovered or active. */
export const HANDLE_FILL_HOVERED = "rgba(0, 120, 255, 0.15)";

/** Off-canvas indicator color (MoveTool dashed outline). */
export const OFF_CANVAS_INDICATOR_COLOR = "rgba(255, 200, 0, 0.75)";

/** Crop overlay dim color. */
export const CROP_DIM_COLOR = "rgba(0,0,0,0.45)";

/** Crop border color. */
export const CROP_BORDER_COLOR = "rgba(255,255,255,0.9)";

/** Crop rule-of-thirds grid color. */
export const CROP_GRID_COLOR = "rgba(255,255,255,0.35)";

// ─── Line styles ─────────────────────────────────────────────────────────────

/** Default gizmo line width (CSS px, before DPR scaling). */
export const GIZMO_LINE_WIDTH = 1;

/** Hovered gizmo line width (CSS px, before DPR scaling). */
export const GIZMO_LINE_WIDTH_HOVERED = 2;

/** Dash pattern for bounding box (DPR-scaled values). */
export const BOUNDING_BOX_DASH_ON = 4;
export const BOUNDING_BOX_DASH_OFF = 4;

/** Dash pattern for off-canvas indicator. */
export const OFF_CANVAS_DASH_ON = 4;
export const OFF_CANVAS_DASH_OFF = 3;
