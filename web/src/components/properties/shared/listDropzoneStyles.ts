import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { SPACING, dropZoneSurfaceStyle, getSpacingPx } from "../../ui_primitives";

export const listDropzoneStyles = (theme: Theme): CSSObject => ({
  ".dropzone": {
    position: "relative",
    minHeight: "80px",
    width: "100%",
    border: "0",
    maxWidth: "none",
    textAlign: "center",
    ...dropZoneSurfaceStyle(theme),
    margin: `${theme.spacing(SPACING.sm)} 0`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  },
  ".dropzone p": {
    textAlign: "center",
    fontFamily: theme.fontFamily2,
    textTransform: "uppercase",
    letterSpacing: "1px",
    fontSize: "var(--fontSizeSmaller)",
    color: theme.vars.palette.grey[500],
    margin: getSpacingPx(SPACING.xl),
    lineHeight: "1.1em"
  }
});
