/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

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
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[300],
      backgroundColor: theme.vars.palette.grey[700],
      border: "1px solid ${theme.vars.palette.grey[600]}",
      borderRadius: 4,
      padding: "4px 8px",
      minWidth: "auto",

      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[100]
      },

      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.common.white,
        fontWeight: 400,

        "&:hover": {
          backgroundColor: theme.vars.palette.primary.dark
        }
      },

      "&.Mui-disabled": {
        color: theme.vars.palette.grey[500],
        backgroundColor: theme.vars.palette.grey[800],
        border: "1px solid ${theme.vars.palette.grey[700]}"
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
    fontSize: theme.fontSizeSmall,
    color: theme.vars.palette.grey[300],
    backgroundColor: theme.vars.palette.grey[700],
    border: "1px solid ${theme.vars.palette.grey[600]}",
    borderRadius: 4,
    padding: "4px 8px",
    minWidth: "auto",

    "&:hover": {
      backgroundColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.grey[100]
    },

    "&.Mui-selected": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.common.white,
      fontWeight: 400,

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    },

    "&.Mui-disabled": {
      color: theme.vars.palette.grey[500],
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`
    }
  });

export const toggleButtonGroupStyle = css({
  backgroundColor: "transparent"
});
