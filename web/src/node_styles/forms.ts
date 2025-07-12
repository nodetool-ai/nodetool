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
      fontSize: `${
        theme.fontSizeSmall || themeVariables.fontSizeSmall
      } !important`
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
      color: theme.palette?.grey?.[400] || "var(--palette-grey-400) !important"
    },

    ".MuiSwitch-switchBase.Mui-checked": {
      color: theme.palette?.grey?.[100] || "var(--palette-grey-100) !important",
      transform: "translateX(12px) !important"
    },

    ".MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
      backgroundColor:
        theme.palette?.grey?.[100] || "var(--palette-grey-100) !important"
    },

    /* MuiCheckbox */
    ".MuiCheckbox-root": {
      padding: "0px 4px !important",
      color:
        theme.palette?.text?.secondary ||
        "var(--palette-text-secondary) !important"
    },

    ".MuiCheckbox-root.Mui-checked": {
      color:
        theme.palette?.primary?.main || "var(--palette-primary-main) !important"
    },

    /* MuiRadio */
    ".MuiRadio-root": {
      color:
        theme.palette?.text?.secondary ||
        "var(--palette-text-secondary) !important"
    },

    ".MuiRadio-root.Mui-checked": {
      color:
        theme.palette?.primary?.main || "var(--palette-primary-main) !important"
    }
  });

// Individual style functions for component-specific use
export const formControlStyle = (theme: Theme) =>
  css({
    margin: 0,
    display: "block",
    width: "100%",
    fontSize: theme.fontSizeSmall || themeVariables.fontSizeSmall
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
      color: theme.palette?.grey?.[400] || "var(--palette-grey-400)",

      "&.Mui-checked": {
        color: theme.palette?.grey?.[100] || "var(--palette-grey-100)",
        transform: "translateX(12px)",

        "+ .MuiSwitch-track": {
          backgroundColor:
            theme.palette?.grey?.[100] || "var(--palette-grey-100)"
        }
      }
    }
  });

export const checkboxStyle = (theme: Theme) =>
  css({
    padding: "0px 4px",
    color: theme.palette?.text?.secondary || "var(--palette-text-secondary)",

    "&.Mui-checked": {
      color: theme.palette?.primary?.main || "var(--palette-primary-main)"
    }
  });

export const radioStyle = (theme: Theme) =>
  css({
    color: theme.palette?.text?.secondary || "var(--palette-text-secondary)",

    "&.Mui-checked": {
      color: theme.palette?.primary?.main || "var(--palette-primary-main)"
    }
  });
