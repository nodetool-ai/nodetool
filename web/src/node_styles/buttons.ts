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
      margin: "0.5em 0 0 0",
      padding: "0.2em 0.6em",
      lineHeight: "1.1em",
      minWidth: "20px",
      fontSize: "0.8em"
      // backgroundColor: _theme.vars.palette.action.active
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
