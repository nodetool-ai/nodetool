import { TYPOGRAPHY } from "../ui_primitives";

/**
 * Root styles for both game editors. Inspector primitives default to mono
 * values; the game editor sets every field in the sans label face, with
 * tabular figures so numeric columns line up, as engine editors do.
 */
export const GAME_EDITOR_ROOT_SX = {
  height: "100%",
  minHeight: 0,
  bgcolor: "background.default",
  "& input, & textarea, & .MuiSelect-select": {
    fontFamily: TYPOGRAPHY.sans.label.fontFamily,
    fontSize: TYPOGRAPHY.sans.label.fontSize,
    fontVariantNumeric: "tabular-nums"
  }
} as const;
