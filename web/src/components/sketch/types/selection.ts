/**
 * Sketch Editor – Selection Types
 *
 * Document-space selection data and select-tool configuration.
 */

// ─── Selection ────────────────────────────────────────────────────────────────

/**
 * Document-space selection: `data` is a byte grid (0–255) of size `width×height`.
 * Values ≥ 128 are used for marching ants / edge detection; any value > 0 is
 * treated as active selection and included in bounds / hit-testing so feather
 * tails behave consistently when painting.
 * Optional `originX` / `originY` place the grid's (0,0) cell at document
 * coordinates; omit or use 0 when the buffer aligns with the canvas top-left
 * (normal marquee / wand). Used when moving a selection so pixels are not lost
 * when the shape extends past the canvas.
 */
export interface Selection {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** Document X of buffer column 0 (default 0). */
  originX?: number;
  /** Document Y of buffer row 0 (default 0). */
  originY?: number;
}

export type SelectToolMode =
  | "rectangle"
  | "ellipse"
  | "lasso"
  | "lasso_polygon"
  | "magic_wand";

export interface SelectSettings {
  mode: SelectToolMode;
  /** 0–255, same perceptual scale as fill tolerance */
  magicWandTolerance: number;
  /** When true, wand selects connected pixels only (flood fill). When false, selects all matching pixels regardless of adjacency. */
  contiguous: boolean;
  /** When true, wand samples the full composite. When false (default), samples the active layer only. */
  sampleAllLayers: boolean;
  /** Pixels — used by "Feather" / "Smooth" post-actions */
  featherRadius: number;
  /** Stroke thickness (px) for "Border" — paints along the selection edge in the foreground color */
  borderWidth: number;
}
