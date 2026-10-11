import type { Theme } from "@mui/material/styles";

import { SPACING } from "../../ui_primitives";

/** Shared frame for the right-panel sections: header inset and a bottom divider. */
export const sketchSectionSx = (theme: Theme) => ({
  flexShrink: 0,
  fontSize: theme.fontSizeSmall,
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  "& > [role='button']": {
    padding: theme.spacing(SPACING.md, SPACING.lg)
  }
});
