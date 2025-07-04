/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";

/**
 * Navigation Component Styles
 *
 * MUI Tabs and Tab component overrides in emotion format
 */

export const navigationStyles = (theme: any) =>
  css({
    /* MuiTabs */
    ".MuiTabs-root": {
      minHeight: "auto"
    },

    ".MuiTabs-indicator": {
      backgroundColor:
        theme.palette?.primary?.main || "var(--palette-primary-main)",
      height: 1
    },

    /* MuiTab */
    ".MuiTab-root": {
      textTransform: "none" as const,
      fontWeight: 300,
      fontSize: theme.fontSizeSmaller || themeVariables.fontSizeSmaller,
      fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
      minHeight: "auto",
      padding: "6px 8px",
      color: theme.palette?.grey?.[400] || "var(--palette-grey-400)",

      "&:hover": {
        color: theme.palette?.grey?.[200] || "var(--palette-grey-200)",
        opacity: 1
      },

      "&.Mui-selected": {
        color: theme.palette?.primary?.main || "var(--palette-primary-main)",
        fontWeight: 400
      },

      "&.Mui-focusVisible": {
        backgroundColor: theme.palette?.grey?.[700] || "var(--palette-grey-700)"
      }
    }
  });

// Individual style functions for component-specific use
export const tabsRootStyle = css({
  minHeight: "auto"
});

export const tabsIndicatorStyle = (theme: any) =>
  css({
    backgroundColor:
      theme.palette?.primary?.main || "var(--palette-primary-main)",
    height: 1
  });

export const tabStyle = (theme: any) =>
  css({
    textTransform: "none" as const,
    fontWeight: 300,
    fontSize: theme.fontSizeSmaller || themeVariables.fontSizeSmaller,
    fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
    minHeight: "auto",
    padding: "6px 8px",
    color: theme.palette?.grey?.[400] || "var(--palette-grey-400)",

    "&:hover": {
      color: theme.palette?.grey?.[200] || "var(--palette-grey-200)",
      opacity: 1
    },

    "&.Mui-selected": {
      color: theme.palette?.primary?.main || "var(--palette-primary-main)",
      fontWeight: 400
    },

    "&.Mui-focusVisible": {
      backgroundColor: theme.palette?.grey?.[700] || "var(--palette-grey-700)"
    }
  });
