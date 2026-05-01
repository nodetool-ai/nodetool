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
      color: theme.vars.palette.primary.light,
      marginBottom: 0
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
      marginTop: 0,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal
    },

    ".slider-value": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
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
      width: "100%",
      minWidth: "30px",
      minHeight: "20px" // Ensure stable height
    },

    ".slider-value .property-label": {
      width: "100%",
      height: "auto",
      margin: 0,
      padding: 0
    },

    ".slider-value .value": {
      display: "flex",
      alignItems: "center",
      color: theme.vars.palette.grey[100],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: "20px",
      height: "20px",
      textAlign: "left",
      flexShrink: 0,
      minWidth: "10px",
      letterSpacing: "normal",
      fontWeight: 400,
      padding: 0,
      marginTop: 0
    },

    ".number-stepper": {
      display: "inline-flex",
      alignItems: "center",
      gap: "2px",
      marginLeft: "6px"
    },

    ".step-button": {
      width: "16px",
      height: "16px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: "3px",
      color: theme.vars.palette.grey[100],
      cursor: "pointer",
      padding: 0,
      fontSize: "11px",
      lineHeight: 1,

      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main
      }
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
      marginLeft: "0 !important",
      marginTop: "0 !important",
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
      height: "4px",
      opacity: 0,
      transition: "opacity 0.15s"
    },

    "&:hover .range-container-wrapper": {
      opacity: 1
    },

    ".range-container": {
      transition:
        "opacity 0.2s, background-color 0.3s ease-in-out, height 0.1s ease-in-out",
      backgroundColor: theme.vars.palette.grey[600],
      display: "block",
      width: "100%",
      height: "4px",
      marginTop: 0,
      borderRadius: "var(--rounded-xs)",
      fontSize: "0.5em",
      minWidth: "1px"
    },

    ".range-indicator": {
      transition: "background-color 0.3s ease-in-out, height 0.2s ease-in-out",
      opacity: 1,
      backgroundColor: theme.vars.palette.grey[500],
      height: "100%",
      borderRadius: "var(--rounded-xs)",

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main
      }
    },

    ".range-container.dragging .range-indicator": {
      backgroundColor: theme.vars.palette.primary.main,
      height: "100%"
    },

    // Always show slider when dragging
    "&:has(.range-container.dragging) .range-container-wrapper": {
      opacity: 1
    }
  });
