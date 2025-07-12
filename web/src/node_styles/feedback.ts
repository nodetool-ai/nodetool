/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";

/**
 * Feedback Component Styles
 *
 * MUI Snackbar component overrides in emotion format
 */

export const feedbackStyles = (theme: Theme) =>
  css({
    /* MuiSnackbar */
    ".MuiSnackbar-root": {
      zIndex: 99999
    },

    ".MuiSnackbarContent-root": {
      backgroundColor: theme.palette?.grey?.[800] || "var(--palette-grey-800)",
      color: theme.palette?.common?.white || "var(--palette-common-white)",
      fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
      fontSize: theme.fontSizeSmall || themeVariables.fontSizeSmall,
      fontWeight: 300,

      ".MuiSnackbarContent-message": {
        padding: 0
      },

      ".MuiSnackbarContent-action": {
        marginRight: 0,
        paddingLeft: 8
      }
    }
  });

// Individual style functions for component-specific use
export const snackbarRootStyle = css({
  zIndex: 99999
});

export const snackbarContentStyle = (theme: Theme) =>
  css({
    backgroundColor: theme.palette?.grey?.[800] || "var(--palette-grey-800)",
    color: theme.palette?.common?.white || "var(--palette-common-white)",
    fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
    fontSize: theme.fontSizeSmall || themeVariables.fontSizeSmall,
    fontWeight: 300,

    ".MuiSnackbarContent-message": {
      padding: 0
    },

    ".MuiSnackbarContent-action": {
      marginRight: 0,
      paddingLeft: 8
    }
  });
