import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { BORDER_RADIUS, MOTION, SPACING, getSpacingPx } from "../../ui_primitives";

export const listDropzoneStyles = (theme: Theme): CSSObject => ({
  ".dropzone": {
    position: "relative",
    minHeight: "80px",
    width: "100%",
    border: "0",
    maxWidth: "none",
    textAlign: "center",
    transition: MOTION.all,
    outline: `1px dashed ${theme.vars.palette.grey[600]}`,
    margin: `${theme.spacing(SPACING.sm)} 0`,
    backgroundColor: theme.vars.palette.c_scrim_soft,
    borderRadius: BORDER_RADIUS.md,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    "&:hover": {
      outline: `1px dashed ${theme.vars.palette.grey[400]}`
    },
    "&.drag-over": {
      backgroundColor: theme.vars.palette.grey[600],
      outline: `2px dashed ${theme.vars.palette.grey[100]}`,
      outlineOffset: "-2px"
    }
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
