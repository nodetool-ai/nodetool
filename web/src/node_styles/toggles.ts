/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";

/**
 * Toggle Component Styles
 *
 * MUI ToggleButton and ToggleButtonGroup component overrides in emotion format
 */

export const toggleStyles = (theme: Theme) =>
  css({
    /* MuiToggleButton */
    ".MuiToggleButton-root": {
      textTransform: "none" as const,
      fontWeight: 300,
      fontSize: theme.fontSizeSmall || themeVariables.fontSizeSmall,
      fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
      color: theme.palette?.grey?.[300] || "var(--palette-grey-300)",
      backgroundColor: theme.palette?.grey?.[700] || "var(--palette-grey-700)",
      border: `1px solid ${
        theme.palette?.grey?.[600] || "var(--palette-grey-600)"
      }`,
      borderRadius: 4,
      padding: "4px 8px",
      minWidth: "auto",

      "&:hover": {
        backgroundColor:
          theme.palette?.grey?.[600] || "var(--palette-grey-600)",
        color: theme.palette?.grey?.[100] || "var(--palette-grey-100)"
      },

      "&.Mui-selected": {
        backgroundColor:
          theme.palette?.primary?.main || "var(--palette-primary-main)",
        color: theme.palette?.common?.white || "var(--palette-common-white)",
        fontWeight: 400,

        "&:hover": {
          backgroundColor:
            theme.palette?.primary?.dark || "var(--palette-primary-dark)"
        }
      },

      "&.Mui-disabled": {
        color: theme.palette?.grey?.[500] || "var(--palette-grey-500)",
        backgroundColor:
          theme.palette?.grey?.[800] || "var(--palette-grey-800)",
        border: `1px solid ${
          theme.palette?.grey?.[700] || "var(--palette-grey-700)"
        }`
      }
    },

    ".MuiToggleButtonGroup-root": {
      backgroundColor: "transparent"
    }
  });

// Individual style functions for component-specific use
export const toggleButtonStyle = (theme: Theme) =>
  css({
    textTransform: "none" as const,
    fontWeight: 300,
    fontSize: theme.fontSizeSmall || themeVariables.fontSizeSmall,
    fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
    color: theme.palette?.grey?.[300] || "var(--palette-grey-300)",
    backgroundColor: theme.palette?.grey?.[700] || "var(--palette-grey-700)",
    border: `1px solid ${
      theme.palette?.grey?.[600] || "var(--palette-grey-600)"
    }`,
    borderRadius: 4,
    padding: "4px 8px",
    minWidth: "auto",

    "&:hover": {
      backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)",
      color: theme.palette?.grey?.[100] || "var(--palette-grey-100)"
    },

    "&.Mui-selected": {
      backgroundColor:
        theme.palette?.primary?.main || "var(--palette-primary-main)",
      color: theme.palette?.common?.white || "var(--palette-common-white)",
      fontWeight: 400,

      "&:hover": {
        backgroundColor:
          theme.palette?.primary?.dark || "var(--palette-primary-dark)"
      }
    },

    "&.Mui-disabled": {
      color: theme.palette?.grey?.[500] || "var(--palette-grey-500)",
      backgroundColor: theme.palette?.grey?.[800] || "var(--palette-grey-800)",
      border: `1px solid ${
        theme.palette?.grey?.[700] || "var(--palette-grey-700)"
      }`
    }
  });

export const toggleButtonGroupStyle = css({
  backgroundColor: "transparent"
});
