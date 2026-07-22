/**
 * useSketchIsMobile
 *
 * True on narrow/coarse-pointer viewports where the editor's fixed side
 * columns (46px tool rail + 260px right panel + 340px assistant) can't sit
 * beside the canvas. Mirrors the app-wide breakpoint used by
 * MobileClassProvider (`theme.breakpoints.down("sm")` = 600px) so the sketch
 * editor participates in the same mobile threshold as the rest of the app.
 */

import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export function useSketchIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("sm"));
}
