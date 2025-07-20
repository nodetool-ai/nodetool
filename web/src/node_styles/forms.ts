/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";
import type { Theme } from "@mui/material/styles";

/**
 * Form Component Styles
 *
 * MUI Form, Switch, Checkbox, and Radio component overrides in emotion format
 */

export const formStyles = (theme: Theme) =>
  css({
    /* MuiFormControl */
    ".MuiFormControl-root": {
      margin: "0 !important",
      display: "block !important",
      width: "100% !important",
      fontSize: `${theme.fontSizeSmall} !important`
    },

    /* MuiFormControlLabel */
    ".MuiFormControlLabel-root": {
      width: "100% !important"
    },

    /* MuiSwitch */
    ".MuiSwitch-root": {
      margin: "0 !important",
      padding: "0 !important",
      width: "24px !important",
      height: "12px !important",
      overflow: "visible !important"
    },

    ".MuiSwitch-thumb": {
      width: "12px !important",
      height: "12px !important",
      borderRadius: "0.25em !important",
      margin: "0 !important",
      padding: "0 !important"
    },

    ".MuiSwitch-track": {
      borderRadius: "0.25em !important"
    },

    ".MuiSwitch-switchBase": {
      margin: "0 !important",
      padding: "0 !important",
      color: theme.vars.palette.grey[400]
    },

    ".MuiSwitch-switchBase.Mui-checked": {
      color: theme.vars.palette.grey[100],
      transform: "translateX(12px) !important"
    },

    ".MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
      backgroundColor: theme.vars.palette.grey[100]
    },

    /* MuiCheckbox */
    ".MuiCheckbox-root": {
      padding: "0px 4px !important",
      color: theme.vars.palette.text.secondary
    },

    ".MuiCheckbox-root.Mui-checked": {
      color: theme.vars.palette.primary.main
    },

    /* MuiRadio */
    ".MuiRadio-root": {
      color: theme.vars.palette.text.secondary
    },

    ".MuiRadio-root.Mui-checked": {
      color: theme.vars.palette.primary.main
    }
  });

// Individual style functions for component-specific use
export const formControlStyle = (theme: Theme) =>
  css({
    margin: 0,
    display: "block",
    width: "100%",
    fontSize: theme.fontSizeSmall
  });

export const switchStyle = (theme: Theme) =>
  css({
    margin: 0,
    padding: 0,
    width: 24,
    height: 12,
    overflow: "visible",

    ".MuiSwitch-thumb": {
      width: 12,
      height: 12,
      borderRadius: "0.25em",
      margin: 0,
      padding: 0
    },

    ".MuiSwitch-track": {
      borderRadius: "0.25em"
    },

    ".MuiSwitch-switchBase": {
      margin: 0,
      padding: 0,
      color: theme.vars.palette.grey[400],

      "&.Mui-checked": {
        color: theme.vars.palette.grey[100],
        transform: "translateX(12px)",

        "+ .MuiSwitch-track": {
          backgroundColor: theme.vars.palette.grey[100]
        }
      }
    }
  });

export const checkboxStyle = (theme: Theme) =>
  css({
    padding: "0px 4px",
    color: theme.vars.palette.text.secondary,

    "&.Mui-checked": {
      color: theme.vars.palette.primary.main
    }
  });

export const radioStyle = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,

    "&.Mui-checked": {
      color: theme.vars.palette.primary.main
    }
  });
