/**
 * Selection module barrel export.
 *
 * All selection-related utilities (mask rasterization, bounds, sampling)
 * are re-exported from here so consumers import from `./selection`
 * instead of reaching into individual files.
 */
export * from "./selectionMask";
export * from "./applySelectionConstraint";
