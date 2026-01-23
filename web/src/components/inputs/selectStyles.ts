/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Styles for the Select component.
 * Extracted from properties.css for component co-location.
 */
export const selectStyles = (theme: Theme) =>
  css({
    "&.select-container": {
      display: "block",
      width: "100%"
    },

    ".select-wrapper": {
      position: "relative",
      flex: 1,
      minWidth: 0,
      height: "auto"
    },

    ".options-list": {
      position: "absolute",
      top: "100%",
      left: 0,
      width: "100%",
      minWidth: "200px",
      maxHeight: "300px",
      overflowY: "auto",
      padding: "4px",
      marginTop: "4px",
      listStyle: "none",
      backgroundColor: "var(--palette-Paper-overlay)",
      backdropFilter: "blur(10px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      borderRadius: "8px",
      zIndex: 10000
    },

    ".options-list .option:first-of-type": {
      color: theme.vars.palette.grey[200]
    },

    ".option": {
      padding: "6px 12px",
      cursor: "pointer",
      fontSize: theme.fontSizeSmall,
      color: "var(--text-primary)",
      transition: "all 0.1s ease",
      whiteSpace: "nowrap",
      borderRadius: "4px",
      marginBottom: "2px"
    },

    ".option:last-child": {
      marginBottom: 0
    },

    ".option:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: "var(--text-primary)"
    },

    ".option.matching": {
      fontWeight: "bold",
      color: theme.vars.palette.grey[0]
    },

    ".option.selected": {
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.primary.main,
      fontWeight: 500
    },

    ".option.highlighted": {
      backgroundColor: theme.vars.palette.action.hover,
      color: "var(--text-primary)"
    },

    ".select-header": {
      position: "relative",
      width: "100%",
      height: "28px",
      padding: "0 8px",
      margin: 0,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[900],
      fontSize: theme.fontSizeSmall,
      borderRadius: "6px",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      transition: "all 0.2s ease"
    },

    ".select-header:hover": {
      borderColor: theme.vars.palette.grey[500],
      backgroundColor: theme.vars.palette.action.hover
    },

    ".select-header-text": {
      color: "var(--text-primary)",
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      userSelect: "none",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },

    ".chevron": {
      transition: "transform 0.2s ease",
      color: theme.vars.palette.grey[400],
      transform: "rotate(0deg)",
      flexShrink: 0,
      marginLeft: "8px"
    },

    ".chevron.open": {
      transform: "rotate(180deg)",
      color: theme.vars.palette.primary.main
    },

    ".search-input": {
      width: "100%",
      height: "28px",
      padding: "0 8px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.primary.main}`,
      borderRadius: "6px",
      color: "var(--text-primary)",
      fontSize: theme.fontSizeSmall,
      outline: "none",
      boxShadow: "0 0 0 2px rgba(33, 150, 243, 0.2)"
    }
  });

/**
 * Portal styles for the dropdown options list.
 * Rendered outside the node container to escape clipPath clipping.
 */
export const portalOptionsStyles = (theme: Theme) =>
  css({
    "&.options-list": {
      position: "fixed",
      minWidth: "200px",
      maxHeight: "300px",
      overflowY: "auto",
      padding: "4px",
      margin: 0,
      listStyle: "none",
      backgroundColor: "var(--palette-Paper-overlay)",
      backdropFilter: "blur(10px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      borderRadius: "8px",
      zIndex: 10000
    },

    ".option:first-of-type": {
      color: theme.vars.palette.grey[200]
    },

    ".option": {
      padding: "6px 12px",
      cursor: "pointer",
      fontSize: theme.fontSizeSmall,
      color: "var(--text-primary)",
      transition: "all 0.1s ease",
      whiteSpace: "nowrap",
      borderRadius: "4px",
      marginBottom: "2px"
    },

    ".option:last-child": {
      marginBottom: 0
    },

    ".option:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: "var(--text-primary)"
    },

    ".option.matching": {
      fontWeight: "bold",
      color: theme.vars.palette.grey[0]
    },

    ".option.selected": {
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.primary.main,
      fontWeight: 500
    },

    ".option.highlighted": {
      backgroundColor: theme.vars.palette.action.hover,
      color: "var(--text-primary)"
    }
  });
