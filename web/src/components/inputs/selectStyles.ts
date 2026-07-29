/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";

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
      padding: getSpacingPx(SPACING.xs),
      marginTop: getSpacingPx(SPACING.xs),
      listStyle: "none",
      backgroundColor: "var(--palette-Paper-overlay)",
      backdropFilter: "blur(10px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      borderRadius: BORDER_RADIUS.lg,
      zIndex: theme.zIndex.popover
    },

    ".options-list .option:first-of-type": {
      color: theme.vars.palette.grey[200]
    },

    ".option": {
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      cursor: "pointer",
      fontSize: theme.fontSizeSmall,
      color: "var(--text-primary)",
      transition: `all ${MOTION.fast}`,
      whiteSpace: "nowrap",
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: getSpacingPx(SPACING.micro)
    },

    ".option:last-child": {
      marginBottom: 0
    },

    ".option:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: "var(--text-primary)"
    },

    ".option.matching": {
      fontWeight: 600,
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
      padding: `0 ${getSpacingPx(SPACING.md)}`,
      margin: 0,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[900],
      fontSize: theme.fontSizeSmall,
      borderRadius: BORDER_RADIUS.md,
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      transition: MOTION.all
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
      transition: `transform ${MOTION.normal}`,
      color: theme.vars.palette.grey[400],
      transform: "rotate(0deg)",
      flexShrink: 0,
      marginLeft: getSpacingPx(SPACING.md)
    },

    ".chevron.open": {
      transform: "rotate(180deg)",
      color: theme.vars.palette.primary.main
    },

    ".search-input": {
      width: "100%",
      height: "28px",
      padding: `0 ${getSpacingPx(SPACING.md)}`,
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.primary.main}`,
      borderRadius: BORDER_RADIUS.md,
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
      padding: getSpacingPx(SPACING.xs),
      margin: 0,
      listStyle: "none",
      backgroundColor: "var(--palette-Paper-overlay)",
      backdropFilter: "blur(10px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      borderRadius: BORDER_RADIUS.lg,
      zIndex: theme.zIndex.popover
    },

    ".option:first-of-type": {
      color: theme.vars.palette.grey[200]
    },

    ".option": {
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      cursor: "pointer",
      fontSize: theme.fontSizeSmall,
      color: "var(--text-primary)",
      transition: `all ${MOTION.fast}`,
      whiteSpace: "nowrap",
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: getSpacingPx(SPACING.micro)
    },

    ".option:last-child": {
      marginBottom: 0
    },

    ".option:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: "var(--text-primary)"
    },

    ".option.matching": {
      fontWeight: 600,
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
