/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";

/**
 * Button Component Styles
 *
 * MUI Button component overrides in emotion format
 */

export const buttonStyles = (theme: any) =>
  css({
    /* MuiButton Root */
    ".MuiButton-root": {
      minWidth: "36px !important"
    },

    ".MuiButton-sizeSmall": {
      margin: "0.5em !important",
      padding: "0.25em 0.5em !important",
      // height: "1.5em !important",
      fontSize: `${
        theme.fontSizeTiny || themeVariables.fontSizeTiny
      } !important`,
      minWidth: "20px !important",
      backgroundColor:
        theme.palette?.grey?.[700] || "var(--palette-grey-700) !important"
    },

    ".MuiButton-sizeSmall:hover": {
      backgroundColor:
        theme.palette?.grey?.[500] || "var(--palette-grey-500) !important"
    },

    /* Button Variants */
    ".MuiButton-medium": {
      padding: "0.2em 0.4em !important",
      lineHeight: "1.1em !important"
    }
  });

// Individual style functions for component-specific use
export const buttonRootStyle = css({
  minWidth: 36
});

export const smallButtonStyle = (theme: any) =>
  css({
    margin: 2,
    padding: "2px 6px",
    height: 15,
    fontSize: theme.fontSizeSmall || themeVariables.fontSizeSmall,
    minWidth: 20,
    backgroundColor: theme.palette?.grey?.[600] || "var(--palette-grey-600)",

    "&:hover": {
      backgroundColor: theme.palette?.grey?.[500] || "var(--palette-grey-500)"
    }
  });

export const mediumButtonStyle = css({
  padding: "0.2em 0.4em",
  lineHeight: "1.1em"
});
