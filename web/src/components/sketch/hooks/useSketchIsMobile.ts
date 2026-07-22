/**
 * useSketchIsMobile
 *
 * True on narrow viewports (width below the `sm` breakpoint = 600px) where the
 * editor's fixed side columns (46px tool rail + 260px right panel + 340px
 * assistant) can't sit beside the canvas. Mirrors the width query used by
 * MobileClassProvider so the sketch editor shares the same mobile threshold as
 * the rest of the app. (Pointer coarseness isn't factored in — a large touch
 * screen still has room for the docked columns.)
 */

import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export function useSketchIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("sm"));
}
