/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";
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
      backgroundColor: theme.palette.primary.main,
      height: 1
    },

    /* MuiTab */
    ".MuiTab-root": {
      textTransform: "none" as const,
      fontWeight: 300,
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1,
      minHeight: "auto",
      padding: "6px 8px",
      color: theme.palette.grey[400],

      "&:hover": {
        color: theme.palette.grey[200],
        opacity: 1
      },

      "&.Mui-selected": {
        color: theme.palette.primary.main,
        fontWeight: 400
      },

      "&.Mui-focusVisible": {
        backgroundColor: theme.palette.grey[700]
      }
    }
  });

// Individual style functions for component-specific use
export const tabsRootStyle = css({
  minHeight: "auto"
});

export const tabsIndicatorStyle = (theme: Theme) =>
  css({
    backgroundColor: theme.palette.primary.main,
    height: 1
  });

export const tabStyle = (theme: Theme) =>
  css({
    textTransform: "none" as const,
    fontWeight: 300,
    fontSize: theme.fontSizeSmaller,
    fontFamily: theme.fontFamily1,
    minHeight: "auto",
    padding: "6px 8px",
    color: theme.palette.grey[400],

    "&:hover": {
      color: theme.palette.grey[200],
      opacity: 1
    },

    "&.Mui-selected": {
      color: theme.palette.primary.main,
      fontWeight: 400
    },

    "&.Mui-focusVisible": {
      backgroundColor: theme.palette.grey[700]
    }
  });
