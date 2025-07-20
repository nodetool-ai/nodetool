/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Navigation Component Styles
 *
 * MUI Tabs and Tab component overrides in emotion format
 */

export const navigationStyles = (theme: Theme) =>
  css({
    /* MuiTabs */
    ".MuiTabs-root": {
      minHeight: "auto"
    },

    ".MuiTabs-indicator": {
      backgroundColor: theme.vars.palette.primary.main,
      height: 1
    },

    /* MuiTab */
    ".MuiTab-root": {
      textTransform: "none" as const,
      fontWeight: 300,
      fontSize: theme.fontSizeSmaller,
      minHeight: "auto",
      padding: "6px 8px",
      color: theme.vars.palette.grey[400],

      "&:hover": {
        color: theme.vars.palette.grey[200],
        opacity: 1
      },

      "&.Mui-selected": {
        color: theme.vars.palette.primary.main,
        fontWeight: 400
      },

      "&.Mui-focusVisible": {
        backgroundColor: theme.vars.palette.grey[700]
      }
    }
  });

// Individual style functions for component-specific use
export const tabsRootStyle = css({
  minHeight: "auto"
});

export const tabsIndicatorStyle = (theme: Theme) =>
  css({
    backgroundColor: theme.vars.palette.primary.main,
    height: 1
  });

export const tabStyle = (theme: Theme) =>
  css({
    textTransform: "none" as const,
    fontWeight: 300,
    fontSize: theme.fontSizeSmaller,
    minHeight: "auto",
    padding: "6px 8px",
    color: theme.vars.palette.grey[400],

    "&:hover": {
      color: theme.vars.palette.grey[200],
      opacity: 1
    },

    "&.Mui-selected": {
      color: theme.vars.palette.primary.main,
      fontWeight: 400
    },

    "&.Mui-focusVisible": {
      backgroundColor: theme.vars.palette.grey[700]
    }
  });
