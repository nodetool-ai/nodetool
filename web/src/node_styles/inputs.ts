/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";
import type { Theme } from "@mui/material/styles";

/**
 * Input Component Styles
 *
 * MUI Input, TextField, and InputLabel component overrides in emotion format
 */

export const inputStyles = (theme: Theme) =>
  css({
    /* MuiInputBase */
    ".MuiInputBase-root": {
      fontSize: theme.fontSizeSmaller,
      lineHeight: "1.1em",
      margin: 0,
      padding: "0 !important",
      width: "100%",
      minHeight: "unset",
      "&::placeholder": {
        opacity: 0,
        visibility: "hidden" as const
      }
    },

    ".MuiInput-root:hover:not(.Mui-disabled):not(.Mui-error)::before": {
      border: 0
    },

    ".MuiInputBase-inputMultiline": {
      margin: 0,
      padding: "2px 8px 0px 4px",
      backgroundColor: theme.vars.palette.grey[600],
      resize: "vertical" as const
    },

    ".MuiInputBase-input": {
      padding: 0,
      maxHeight: "40em"
    },

    /* MuiTextField */
    ".MuiTextField-root": {
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.0em",
      backgroundColor: "transparent",
      minHeight: 18,
      margin: 0,
      padding: "0 0.5em 0.5em 0.2em",
      resize: "vertical" as const,

      ".MuiInput-underline:before, .MuiInput-underline:after": {
        borderBottom: 0
      },

      ".MuiInputBase-inputMultiline": {
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.5em",
        cursor: "auto"
      },

      ".MuiOutlinedInput-root": {
        minHeight: "unset"
      },

      ".MuiOutlinedInput-notchedOutline legend": {
        display: "none"
      }
    },

    /* Specific MUI generated class override */
    ".css-1vcww86-MuiFormControl-root-MuiTextField-root .MuiOutlinedInput-root":
      {
        minHeight: "unset"
      },

    /* MuiInputLabel */
    ".MuiInputLabel-root": {
      position: "relative" as const,
      marginBottom: -3,
      letterSpacing: "-0.02em",
      transform: "translate(0px, 0px) scale(1.0)",
      textTransform: "capitalize" as const,
      transformOrigin: "top left",
      fontSize: theme.fontSizeSmall,
      lineHeight: "1em",
      minHeight: "1.2em",
      margin: 0,

      "&.Mui-focused": {
        color: theme.vars.palette.grey[0]
      }
    },

    /* MuiLink */
    ".MuiLink-root": {
      marginLeft: "0.6em",
      marginRight: "0.6em"
    }
  });

// Individual style functions for component-specific use
export const inputBaseStyle = (theme: Theme) =>
  css({
    fontSize: theme.fontSizeNormal,
    lineHeight: "1.1em",
    margin: 0,
    padding: 0,
    width: "100%",

    "&::placeholder": {
      opacity: 0,
      visibility: "hidden" as const
    }
  });

export const textFieldStyle = (theme: Theme) =>
  css({
    fontSize: theme.fontSizeSmall,
    lineHeight: "1.0em",
    backgroundColor: "transparent",
    minHeight: 15,
    margin: 0,
    padding: "0 0.5em 0.5em 0.2em",
    resize: "vertical" as const,

    ".MuiInput-underline:before, .MuiInput-underline:after": {
      borderBottom: 0
    },

    ".MuiInputBase-inputMultiline": {
      fontSize: theme.fontSizeSmaller,
      lineHeight: "1.1em",
      cursor: "auto"
    },

    ".MuiOutlinedInput-notchedOutline legend": {
      display: "none"
    }
  });

export const inputLabelStyle = (theme: Theme) =>
  css({
    position: "relative" as const,
    marginBottom: -3,
    letterSpacing: "-0.02em",
    transform: "translate(0px, 0px) scale(1.0)",
    textTransform: "capitalize" as const,
    transformOrigin: "top left",
    fontSize: theme.fontSizeSmall,
    lineHeight: "1em",
    minHeight: "1.2em",
    margin: 0,

    "&.Mui-focused": {
      color: theme.vars.palette.grey[0]
    }
  });
