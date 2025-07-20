/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Button Component Styles
 * Using CSS variables from Material-UI theme system
 */

export const buttonStyles = (_theme: Theme) =>
  css({
    ".MuiButton-root": {
      minWidth: "36px !important"
    },
    ".MuiButton-sizeSmall": {
      margin: "0.2em !important",
      padding: "0.25em 0.5em !important",
      lineHeight: "1.1em",
      minWidth: "20px",
      backgroundColor: "var(--palette-background-paper)"
    },
    ".MuiButton-sizeSmall:hover": {
      backgroundColor: "var(--palette-grey-700)"
    },
    ".MuiButton-medium": {
      padding: "0.2em 0.4em !important",
      lineHeight: "1.1em !important"
    }
  });

export const smallButtonStyle = (theme: Theme) =>
  css({
    margin: 2,
    padding: "2px 6px",
    height: 15,
    fontSize: theme.fontSizeSmall,
    minWidth: 20,
    backgroundColor: "var(--palette-grey-600)",
    "&:hover": {
      backgroundColor: "var(--palette-grey-500)"
    }
  });
