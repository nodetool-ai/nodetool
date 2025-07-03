/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";

/**
 * Select Component Styles
 *
 * MUI Select and MenuItem component overrides in emotion format
 */

export const selectStyles = (theme: any) =>
  css({
    /* MuiSelect */
    ".MuiSelect-root": {
      width: "100% !important"
    },

    ".MuiSelect-select": {
      width: "100% !important",
      padding: "0 0 0 0.4em !important",
      fontFamily: `${
        theme.fontFamily1 || themeVariables.fontFamily1
      } !important`,
      fontSize: `${
        theme.fontSizeSmaller || themeVariables.fontSizeSmaller
      } !important`,
      backgroundColor:
        theme.palette?.grey?.[600] || "var(--palette-grey-600) !important",
      margin: "0 !important"
    },

    ".MuiSelect-icon": {
      color: theme.palette?.grey?.[400] || "var(--palette-grey-400) !important"
    },

    /* MuiMenuItem */
    ".MuiMenuItem-root": {
      fontFamily: `${
        theme.fontFamily1 || themeVariables.fontFamily1
      } !important`,
      backgroundColor:
        theme.palette?.grey?.[600] || "var(--palette-grey-600) !important",
      marginBottom: "0px !important",
      paddingTop: "4px !important",
      paddingBottom: "4px !important",
      fontWeight: "300 !important"
    },

    ".MuiMenuItem-root:nth-of-type(even)": {
      backgroundColor:
        theme.palette?.grey?.[700] || "var(--palette-grey-700) !important"
    },

    ".MuiMenuItem-root:nth-of-type(even):hover": {
      backgroundColor:
        theme.palette?.grey?.[500] || "var(--palette-grey-500) !important"
    },

    ".MuiMenuItem-root:nth-of-type(even):selected": {
      backgroundColor:
        theme.palette?.grey?.[600] || "var(--palette-grey-600) !important"
    },

    ".MuiMenuItem-root:nth-of-type(odd)": {
      backgroundColor:
        theme.palette?.grey?.[600] || "var(--palette-grey-600) !important"
    },

    ".MuiMenuItem-root:nth-of-type(odd):hover": {
      backgroundColor:
        theme.palette?.grey?.[500] || "var(--palette-grey-500) !important"
    },

    ".MuiMenuItem-root:nth-of-type(odd):selected": {
      backgroundColor:
        theme.palette?.grey?.[600] || "var(--palette-grey-600) !important"
    },

    ".MuiMenuItem-root.Mui-hover": {
      color:
        theme.palette?.primary?.light ||
        "var(--palette-primary-light) !important",
      backgroundColor:
        theme.palette?.grey?.[500] || "var(--palette-grey-500) !important"
    },

    ".MuiMenuItem-root.Mui-selected": {
      color:
        theme.palette?.primary?.main ||
        "var(--palette-primary-main) !important",
      backgroundColor:
        theme.palette?.grey?.[600] || "var(--palette-grey-600) !important"
    }
  });

// Individual style functions for component-specific use
export const selectRootStyle = css({
  width: "100%"
});

export const selectInputStyle = (theme: any) =>
  css({
    width: "100%",
    padding: "0 0 0 0.4em",
    fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
    fontSize: theme.fontSizeSmaller || themeVariables.fontSizeSmaller,
    backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)",
    margin: 0
  });

export const selectIconStyle = (theme: any) =>
  css({
    color: theme.palette?.grey?.[400] || "var(--palette-grey-400)"
  });

export const menuItemStyle = (theme: any) =>
  css({
    fontFamily: theme.fontFamily1 || themeVariables.fontFamily1,
    backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)",
    marginBottom: 0,
    paddingTop: 4,
    paddingBottom: 4,
    fontWeight: 300,

    "&:nth-of-type(even)": {
      backgroundColor: theme.palette?.grey?.[700] || "var(--palette-grey-700)",

      "&:hover": {
        backgroundColor: theme.palette?.grey?.[500] || "var(--palette-grey-500)"
      },

      "&:selected": {
        backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)"
      }
    },

    "&:nth-of-type(odd)": {
      backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)",

      "&:hover": {
        backgroundColor: theme.palette?.grey?.[500] || "var(--palette-grey-500)"
      },

      "&:selected": {
        backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)"
      }
    },

    "&.Mui-hover": {
      color: theme.palette?.primary?.light || "var(--palette-primary-light)",
      backgroundColor: theme.palette?.grey?.[500] || "var(--palette-grey-500)"
    },

    "&.Mui-selected": {
      color: theme.palette?.primary?.main || "var(--palette-primary-main)",
      backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)"
    }
  });
