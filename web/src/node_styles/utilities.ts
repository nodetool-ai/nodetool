/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";

/**
 * Utility Component Styles
 *
 * MUI Fab, SvgIcon, and other utility component overrides in emotion format
 */

export const utilityStyles = (theme: Theme) =>
  css({
    /* MuiFab */
    ".MuiFab-root": {
      backgroundColor:
        theme.palette?.primary?.main || "var(--palette-primary-main)",
      color: theme.palette?.common?.white || "var(--palette-common-white)",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",

      "&:hover": {
        backgroundColor:
          theme.palette?.primary?.dark || "var(--palette-primary-dark)",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)"
      },

      "&.Mui-disabled": {
        backgroundColor:
          theme.palette?.grey?.[600] || "var(--palette-grey-600)",
        color: theme.palette?.grey?.[400] || "var(--palette-grey-400)"
      }
    },

    ".MuiFab-sizeSmall": {
      width: 32,
      height: 32,
      fontSize: theme.fontSizeSmaller || themeVariables.fontSizeSmaller
    },

    ".MuiFab-sizeMedium": {
      width: 48,
      height: 48,
      fontSize: theme.fontSizeNormal || themeVariables.fontSizeNormal
    },

    ".MuiFab-sizeLarge": {
      width: 64,
      height: 64,
      fontSize: theme.fontSizeBig || themeVariables.fontSizeBig
    },

    /* MuiSvgIcon */
    ".MuiSvgIcon-root": {
      fontSize: "1.2rem",
      color: "inherit"
    },

    ".MuiSvgIcon-fontSizeSmall": {
      fontSize: "1rem"
    },

    ".MuiSvgIcon-fontSizeLarge": {
      fontSize: "1.5rem"
    }
  });

// Individual style functions for component-specific use
export const fabStyle = (theme: Theme) =>
  css({
    backgroundColor:
      theme.palette?.primary?.main || "var(--palette-primary-main)",
    color: theme.palette?.common?.white || "var(--palette-common-white)",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",

    "&:hover": {
      backgroundColor:
        theme.palette?.primary?.dark || "var(--palette-primary-dark)",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)"
    },

    "&.Mui-disabled": {
      backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)",
      color: theme.palette?.grey?.[400] || "var(--palette-grey-400)"
    }
  });

export const fabSizeSmallStyle = (theme: Theme) =>
  css({
    width: 32,
    height: 32,
    fontSize: theme.fontSizeSmaller || themeVariables.fontSizeSmaller
  });

export const fabSizeMediumStyle = (theme: Theme) =>
  css({
    width: 48,
    height: 48,
    fontSize: theme.fontSizeNormal || themeVariables.fontSizeNormal
  });

export const fabSizeLargeStyle = (theme: Theme) =>
  css({
    width: 64,
    height: 64,
    fontSize: theme.fontSizeBig || themeVariables.fontSizeBig
  });

export const svgIconStyle = css({
  fontSize: "1.2rem",
  color: "inherit"
});

export const svgIconSmallStyle = css({
  fontSize: "1rem"
});

export const svgIconLargeStyle = css({
  fontSize: "1.5rem"
});
