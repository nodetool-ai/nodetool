/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Styles for the NumberInput component.
 * Extracted from properties.css for component co-location.
 */
export const numberInputStyles = (theme: Theme) =>
  css({
    "&.number-input": {
      display: "block",
      cursor: "ew-resize !important",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.primary.light,
      marginBottom: "10px"
    },

    // Highlight when the owning PropertyInput is marked as changed.
    // PropertyInput applies `value-changed` on a wrapper above this component.
    ".value-changed & .slider-value .value": {
      // color: theme.vars.palette.primary.main
    },

    label: {
      cursor: "ew-resize !important"
    },

    ".value": {
      marginTop: "-3px",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal
    },

    ".slider-value": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      outline: "none !important",
      width: "100%",
      marginBottom: 0,
      minHeight: "18px",
      marginTop: "-1px"
    },

    ".slider-value .property-label": {
      flexGrow: 1,
      width: "auto",
      height: "auto",
      margin: 0,
      padding: 0
    },

    // ".slider-value .property-label label": {
    //   position: "relative",
    //   display: "block",
    //   textTransform: "capitalize",
    //   fontWeight: 500,
    //   fontSize: theme.fontSizeSmall,
    //   color: theme.vars.palette.grey[300],
    //   lineHeight: "1.2em",
    //   letterSpacing: "0.01em",
    //   overflow: "hidden",
    //   textOverflow: "ellipsis",
    //   whiteSpace: "nowrap",
    //   margin: "-4px 8px 0 0",
    //   padding: 0
    // },

    ".slider-value .value": {
      position: "relative",
      color: theme.vars.palette.grey[100],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.2em",
      textAlign: "right",
      flexShrink: 0,
      minWidth: "30px"
    },

    // Changed state: value differs from default
    "&.changed .slider-value .value": {
      color: theme.vars.palette.primary.main
    },

    ".edit-value": {
      position: "absolute",
      outline: "none",
      color: theme.vars.palette.grey[0],
      backgroundColor: theme.vars.palette.grey[800],
      border: "none",
      borderRadius: 0,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.5em",
      height: "12px",
      top: "2px",
      right: 0,
      margin: 0,
      padding: 0,
      textAlign: "right",
      maxWidth: "100px"
    },

    ".editable-input-container": {
      display: "contents"
    },

    ".edit-value input::selection": {
      backgroundColor: "var(--c-hl1)"
    },

    ".range-container-wrapper": {
      display: "block",
      width: "100%",
      marginTop: 0,
      height: "4px"
    },

    ".range-container": {
      transition:
        "opacity 0.2s, background-color 0.3s ease-in-out, height 0.1s ease-in-out",
      backgroundColor: theme.vars.palette.grey[600],
      display: "block",
      width: "100%",
      height: "4px",
      marginTop: 0,
      borderRadius: "2px",
      fontSize: "0.5em",
      minWidth: "1px"
    },

    ".range-indicator": {
      transition: "background-color 0.3s ease-in-out, height 0.2s ease-in-out",
      opacity: 1,
      backgroundColor: theme.vars.palette.grey[500],
      height: "100%",
      borderRadius: "2px",

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main
      }
    },

    ".range-container.dragging .range-indicator": {
      backgroundColor: theme.vars.palette.primary.main,
      height: "100%"
    }
  });
