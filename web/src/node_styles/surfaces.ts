/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";
import type { Theme } from "@mui/material/styles";

/**
 * Surface Component Styles
 *
 * MUI Backdrop, Popover, and Dialog component overrides in emotion format
 */

export const surfacesStyles = (theme: Theme) =>
  css({
    /* MuiBackdrop */
    ".MuiBackdrop-root": {
      zIndex: -1,
      backgroundColor: "rgba(0, 0, 0, 0.5)"
    },

    /* MuiPopover */
    ".MuiPopover-root": {
      zIndex: 99999
    },

    ".MuiPopover-paper": {
      backgroundColor: theme.palette.grey[700],
      border: `1px solid ${theme.palette.grey[600]}`,
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
    },

    /* MuiDialog */
    ".MuiDialog-root": {
      zIndex: 10000
    },

    ".MuiDialog-paper": {
      backgroundColor: theme.palette.background.paper,
      color: theme.palette.common.white
    },

    ".MuiDialogTitle-root": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig,
      fontWeight: 400,
      padding: "16px 24px 8px"
    },

    ".MuiDialogContent-root": {
      padding: "8px 24px"
    },

    ".MuiDialogActions-root": {
      padding: "8px 24px 16px",
      justifyContent: "flex-end"
    }
  });

// Individual style functions for component-specific use
export const backdropStyle = css({
  zIndex: -1,
  backgroundColor: "rgba(0, 0, 0, 0.5)"
});

export const popoverRootStyle = css({
  zIndex: 99999
});

export const popoverPaperStyle = (theme: Theme) =>
  css({
    backgroundColor: theme.palette.grey[700],
    border: "1px solid ${theme.palette.grey[600]",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
  });

export const dialogRootStyle = css({
  zIndex: 10000
});

export const dialogPaperStyle = (theme: Theme) =>
  css({
    backgroundColor: theme.palette.grey[800],
    color: theme.palette.common.white
  });

export const dialogTitleStyle = (theme: Theme) =>
  css({
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeBig,
    fontWeight: 400,
    padding: "16px 24px 8px"
  });

export const dialogContentStyle = css({
  padding: "8px 24px"
});

export const dialogActionsStyle = css({
  padding: "8px 24px 16px",
  justifyContent: "flex-end"
});
