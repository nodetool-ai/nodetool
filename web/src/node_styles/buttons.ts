/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { themeVariables } from "./theme-variables";

/**
 * Button Component Styles
 * Using CSS variables from Material-UI theme system
 */

export const buttonStyles = (_theme: Theme) =>
  css({
    ".MuiButton-root": {
      minWidth: "36px"
    },
    ".MuiButton-sizeSmall": {
      lineHeight: "1.5em",
      minWidth: "24px",
      fontSize: "0.8em"
      // backgroundColor: _theme.vars.palette.grey[800]
    },
    ".MuiButton-sizeSmall:hover": {
      backgroundColor: _theme.vars.palette.action.hover
    },
    ".MuiButton-medium": {
      padding: "0.2em 0.4em",
      lineHeight: "1.1em"
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
