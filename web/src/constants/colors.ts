// Theme-aligned color palette (paletteDark)
export const colorPickerColors = [
  null, // Empty color
  // Neutrals — clearly stepped so each swatch reads as a distinct value
  "#0F1115", // near-black
  "#475569", // slate / dark grey
  "#94A3B8", // mid grey
  "#CBD5E1", // light grey
  "#FFFFFF", // white
  // Primary scale
  "#93C5FD", // primary.light
  "#60A5FA", // primary.main
  "#1D4ED8", // primary.dark
  // Secondary scale
  "#C4B5FD", // secondary.light
  "#A78BFA", // secondary.main (violet)
  "#6D28D9", // secondary.dark
  // Accents
  "#E35BFF", // c_attention (magenta)
  "#50FA7B", // success.main (green)
  "#FFB86C", // warning.main (orange/yellow)
  "#FF5555", // error.main (red)
  "#029486" // c_node (teal/cyan)
] as const;