import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { EYEBROW, TYPOGRAPHY } from "./tokens";
import { selectableRowStyles, selectedRowStyles } from "./selectionStyles";
import { SPACING, getSpacingPx } from "./spacing";

// Sidebar document list panels. Apply to the panel root, then use the class
// names below on the children.
export const listPanelStyles = (theme: Theme) =>
  css({
    height: "100%",
    minHeight: 0,
    // Same inset below the panel header as the documents and more panels.
    ".list-panel-search": {
      paddingBlock: theme.spacing(2)
    },
    ".list-panel-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".list-panel-item": {
      width: "100%",
      border: 0,
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      padding: theme.spacing(1),
      textAlign: "left",
      ...selectableRowStyles(theme),
      "&.active": selectedRowStyles(theme)
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
      ...TYPOGRAPHY.sans.label,
      outline: "none"
    },
    // Date groups ("Today", "Last week") use the panel group title (DESIGN.md
    // §10): caption type, uppercase, muted, left-aligned with the rows.
    ".date-header-row": {
      width: "100%",
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xs)}`
    },
    ".date-header": {
      ...EYEBROW,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap"
    }
  });
