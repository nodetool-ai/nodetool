/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Select Component Styles
 *
 * MUI Select and MenuItem component overrides in emotion format
 */

export const selectStyles = (theme: Theme) =>
  css({
    /* MuiSelect */
    ".MuiSelect-root": {
      width: "100% !important"
    },

    ".MuiSelect-select": {
      width: "100% !important",
      padding: "0 0 0 0.4em !important",
      fontSize: `${theme.fontSizeSmaller} !important`,
      backgroundColor: theme.vars.palette.grey[600],
      margin: "0 !important"
    },

    ".MuiSelect-icon": {
      color: theme.vars.palette.grey[400]
    },

    /* MuiMenuItem */
    ".MuiMenuItem-root": {
      backgroundColor: theme.vars.palette.grey[600],
      marginBottom: "0px !important",
      paddingTop: "4px !important",
      paddingBottom: "4px !important",
      fontWeight: "300 !important"
    },

    ".MuiMenuItem-root:nth-of-type(even)": {
      backgroundColor: theme.vars.palette.grey[700]
    },

    ".MuiMenuItem-root:nth-of-type(even):hover": {
      backgroundColor: theme.vars.palette.grey[500]
    },

    ".MuiMenuItem-root:nth-of-type(even):selected": {
      backgroundColor: theme.vars.palette.grey[600]
    },

    ".MuiMenuItem-root:nth-of-type(odd)": {
      backgroundColor: theme.vars.palette.grey[600]
    },

    ".MuiMenuItem-root:nth-of-type(odd):hover": {
      backgroundColor: theme.vars.palette.grey[500]
    },

    ".MuiMenuItem-root:nth-of-type(odd):selected": {
      backgroundColor: theme.vars.palette.grey[600]
    },

    ".MuiMenuItem-root.Mui-hover": {
      color: theme.vars.palette.primary.light,
      backgroundColor: theme.vars.palette.grey[500]
    },

    ".MuiMenuItem-root.Mui-selected": {
      color: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.grey[600]
    }
  });

// Individual style functions for component-specific use
export const selectRootStyle = css({
  width: "100%"
});

export const selectInputStyle = (theme: Theme) =>
  css({
    width: "100%",
    padding: "0 0 0 0.4em",
    fontSize: theme.fontSizeSmaller,
    backgroundColor: theme.vars.palette.grey[600],
    margin: 0
  });

export const selectIconStyle = (theme: Theme) =>
  css({
    color: theme.vars.palette.grey[400]
  });

export const menuItemStyle = (theme: Theme) =>
  css({
    backgroundColor: theme.vars.palette.grey[600],
    marginBottom: 0,
    paddingTop: 4,
    paddingBottom: 4,
    fontWeight: 300,

    "&:nth-of-type(even)": {
      backgroundColor: theme.vars.palette.grey[700],

      "&:hover": {
        backgroundColor: theme.vars.palette.grey[500]
      },

      "&:selected": {
        backgroundColor: theme.vars.palette.grey[600]
      }
    },

    "&:nth-of-type(odd)": {
      backgroundColor: theme.vars.palette.grey[600],

      "&:hover": {
        backgroundColor: theme.vars.palette.grey[500]
      },

      "&:selected": {
        backgroundColor: theme.vars.palette.grey[600]
      }
    },

    "&.Mui-hover": {
      color: theme.vars.palette.primary.light,
      backgroundColor: theme.vars.palette.grey[500]
    },

    "&.Mui-selected": {
      color: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.grey[600]
    }
  });
