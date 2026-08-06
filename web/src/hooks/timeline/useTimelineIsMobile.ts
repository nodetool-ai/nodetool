/**
 * useTimelineIsMobile
 *
 * True on narrow viewports (below the `sm` breakpoint = 600px) where the
 * timeline editor's desktop layout doesn't fit: a 55/45 preview–inspector
 * split, a 192px track-header column, and a top bar carrying a prompt plus
 * four setting chips plus four labelled buttons. Below `sm` those collapse to
 * a single-column shell (see TimelineEditor).
 *
 * Mirrors the query used by MobileClassProvider and `useSketchIsMobile` so the
 * timeline shares one mobile threshold with the rest of the app.
 */

import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export function useTimelineIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("sm"));
}
