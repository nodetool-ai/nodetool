import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { MOTION } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

// Sidebar document list panels. Apply to the panel root, then use the class
// names below on the children.
export const listPanelStyles = (theme: Theme) =>
  css({
    height: "100%",
    minHeight: 0,
    ".list-panel-search": {
      paddingBottom: theme.spacing(1)
    },
    ".list-panel-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".list-panel-item": {
      width: "100%",
      border: 0,
      borderRadius: theme.rounded.md,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      padding: theme.spacing(1),
      textAlign: "left",
      transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".list-panel-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".rename-input": {
      width: "100%",
      background: "transparent",
      border: `1px solid ${theme.vars.palette.primary.main}`,
      borderRadius: theme.rounded.sm,
      color: "inherit",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      outline: "none"
    },
    ".date-header-row": {
      width: "100%",
      padding: `0 ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xs)} 0`,
      display: "flex",
      alignItems: "flex-end",
      borderBottom: "1px solid var(--palette-divider)"
    },
    ".date-header": {
      fontSize: theme.fontSizeSmaller,
      flexShrink: 0,
      padding: 0,
      lineHeight: 1.1,
      width: "100%",
      textAlign: "right",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    }
  });
