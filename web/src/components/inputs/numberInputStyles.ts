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
      position: "relative",
      cursor: "ew-resize !important",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.primary.main,
      marginBottom: 0 // Remove margin to prevent flex container imbalance
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
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "8px",
      outline: "none !important",
      width: "100%",
      marginBottom: 0,
      minHeight: "18px",
      marginTop: "-1px"
    },

    ".value-container": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      minWidth: "30px",
      minHeight: "20px" // Ensure stable height
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
      display: "flex", // Use flex to match input
      alignItems: "center", // Center text vertically
      color: theme.vars.palette.grey[100],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: "20px",
      height: "20px",
      textAlign: "left",
      flexShrink: 0,
      minWidth: "30px",
      letterSpacing: "normal",
      fontWeight: 400,
      padding: 0,
      marginTop: "-6px"
    },

    // Changed state: value differs from default
    "&.changed .slider-value .value": {
      color: theme.vars.palette.primary.main
    },

    ".edit-value": {
      display: "flex",
      alignItems: "center",
      outline: "none",
      color: theme.vars.palette.grey[100] + " !important",
      backgroundColor: "transparent",
      border: "none",
      borderRadius: 0,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: "20px !important",
      height: "20px !important",
      marginLeft: "1.25em !important",
      marginTop: "-6px !important",
      padding: "0 !important",
      textAlign: "left",
      maxWidth: "100px",
      zIndex: 10,
      letterSpacing: "normal",
      fontWeight: 400,
      appearance: "none",
      boxShadow: "none"
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
