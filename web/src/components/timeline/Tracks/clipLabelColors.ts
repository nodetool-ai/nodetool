/**
 * The colors the clip menu offers as a clip's `labelColor` (CE8, D55).
 * They are stored on the clip as plain CSS colors, so they are literal values
 * and not theme variables.
 */
export const CLIP_LABEL_COLORS: readonly string[] = [
  // Row 1: full color.
  "#e5484d",
  "#f76b15",
  "#f5d90a",
  "#30a46c",
  "#12a594",
  "#3e63dd",
  "#8e4ec6",
  "#d6409f",
  // Row 2: light.
  "#ff9592",
  "#ffa057",
  "#ffe770",
  "#3dd68c",
  "#0bd8b6",
  "#9eb1ff",
  "#d19dff",
  "#ff8dcc",
  // Row 3: dark.
  "#a2272c",
  "#a64a0e",
  "#9e8a00",
  "#1f6b46",
  "#0d6b5f",
  "#2a3f99",
  "#5b2f87",
  "#8f2b6a"
];

/** Swatches per row of the color picker grid. */
export const CLIP_LABEL_COLUMNS = 8;
