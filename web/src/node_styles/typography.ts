/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { themeVariables } from "./theme-variables";
import type { Theme } from "@mui/material/styles";

/**
 * Typography Component Styles
 *
 * MUI Typography component overrides in emotion format
 */

export const typographyStyles = (theme: Theme) =>
  css({
    /* MuiTypography Caption */
    ".MuiTypography-caption": {
      display: "block !important",
      fontSize: "0.55em !important",
      marginTop: "-0.5em !important"
    },

    /* MuiTypography Headings */
    ".MuiTypography-h1": {
      fontSize: "2em !important",
      fontWeight: "400 !important",
      marginTop: theme.spacing(4),
      marginBottom: theme.spacing(2),
      fontFamily: theme.fontFamily2,
      wordSpacing: "-3px !important"
    },

    ".MuiTypography-h2": {
      fontSize: "1.75em !important",
      fontWeight: "400 !important",
      marginTop: theme.spacing(4),
      marginBottom: theme.spacing(2),
      fontFamily: theme.fontFamily2,
      wordSpacing: "-0.2em !important"
    },

    ".MuiTypography-h3": {
      fontSize: "1.5em",
      fontWeight: "400",
      marginTop: theme.spacing(4),
      marginBottom: theme.spacing(2),
      fontFamily: theme.fontFamily2,
      wordSpacing: "-0.2em"
    },

    ".MuiTypography-h4": {
      fontSize: "1.25em",
      marginTop: theme.spacing(4),
      marginBottom: theme.spacing(2),
      textTransform: "uppercase" as const,
      fontWeight: "300",
      fontFamily: theme.fontFamily2,
      wordSpacing: "-0.2em"
    },

    ".MuiTypography-h5": {
      fontSize: "0.8em",
      marginTop: theme.spacing(4),
      marginBottom: theme.spacing(2),
      textTransform: "uppercase" as const,
      fontWeight: "600",
      fontFamily: theme.fontFamily2,
      wordSpacing: "-0.2em"
    },

    ".MuiTypography-h6": {
      fontSize: "0.8em",
      marginTop: theme.spacing(4),
      marginBottom: theme.spacing(2),
      fontFamily: theme.fontFamily2,
      textTransform: "uppercase" as const,
      wordSpacing: "-0.2em"
    },

    ".MuiTypography-body1": {
      fontWeight: "300",
      wordSpacing: "0",
      lineHeight: "1.1",
      marginTop: "0",
      marginBottom: "0"
    },

    ".MuiTypography-body2": {
      fontSize: "1em",
      fontWeight: "300",
      lineHeight: "1.1"
    }
  });

// Individual style functions for component-specific use
export const captionStyle = (theme: Theme) =>
  css({
    display: "block",
    fontSize: "0.55em",
    marginTop: "-0.5em"
  });

export const h1Style = (theme: Theme) =>
  css({
    fontSize: "2em",
    fontWeight: "400",
    marginTop: theme.spacing(4),
    marginBottom: theme.spacing(2),
    fontFamily: theme.fontFamily2,
    wordSpacing: "-3px"
  });

export const h2Style = (theme: Theme) =>
  css({
    fontSize: "1.75em",
    fontWeight: "400",
    marginTop: theme.spacing(4),
    marginBottom: theme.spacing(2),
    fontFamily: theme.fontFamily2,
    wordSpacing: "-0.2em"
  });

export const bodyStyle = (theme: Theme) =>
  css({
    fontSize: "1em",
    fontWeight: "300",
    wordSpacing: "0",
    lineHeight: "1.1",
    margin: "0"
  });
