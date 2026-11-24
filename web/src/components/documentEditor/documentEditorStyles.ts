/**
 * The page look of the document editor: a readable column, headings, lists,
 * task boxes, tables, quotes and code, all from theme tokens.
 */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { codeHighlightTheme } from "../textEditor/codeHighlightTheme";
import { codeHighlightTokenStyles } from "../textEditor/codeHighlightStyles";
import {
  BORDER_RADIUS,
  FONT_SIZE_MONO,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  MOTION,
  SPACING,
  TYPOGRAPHY,
  Z_INDEX,
  getSpacingPx,
  reducedMotion,
  scrollbarStyles
} from "../ui_primitives";

/** Lexical class names; the styles below give each one its look. */
export const DOCUMENT_THEME = {
  ...codeHighlightTheme,
  paragraph: "doc-paragraph",
  quote: "doc-quote",
  heading: {
    h1: "doc-h1",
    h2: "doc-h2",
    h3: "doc-h3",
    h4: "doc-h4",
    h5: "doc-h5",
    h6: "doc-h6"
  },
  list: {
    ul: "doc-ul",
    ol: "doc-ol",
    listitem: "doc-li",
    listitemChecked: "doc-li-checked",
    listitemUnchecked: "doc-li-unchecked",
    nested: { listitem: "doc-li-nested" }
  },
  link: "doc-link",
  text: {
    bold: "doc-bold",
    italic: "doc-italic",
    strikethrough: "doc-strike",
    underline: "doc-underline",
    code: "doc-inline-code"
  },
  table: "doc-table",
  tableRow: "doc-tr",
  tableCell: "doc-td",
  tableCellHeader: "doc-th"
};

const sp = getSpacingPx;

export const documentEditorStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.background.default,
    ".doc-scroll": {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      position: "relative",
      ...scrollbarStyles(theme)
    },
    ".doc-title-header": {
      flexShrink: 0,
      width: "100%",
      boxSizing: "border-box",
      padding: `${sp(SPACING.md)} ${sp(SPACING.xl)} ${sp(SPACING.sm)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".doc-title-text, .doc-title-input": {
      fontFamily: "var(--fontFamily1)",
      fontSize: `calc(${FONT_SIZE_SANS.title} * 2)`,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
      color: theme.vars.palette.text.primary
    },
    ".doc-change-modified, .doc-change-inserted": {
      boxShadow: `inset 3px 0 0 ${theme.vars.palette.primary.main}`,
      paddingLeft: sp(SPACING.md),
      marginLeft: `-${sp(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.xs,
      transition: MOTION.background,
      ...reducedMotion({ transition: MOTION.none })
    },
    ".doc-change-inserted": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".doc-persistent-selection": {
      position: "absolute",
      pointerEvents: "none",
      userSelect: "none",
      borderRadius: BORDER_RADIUS.xs,
      backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.24)`,
      zIndex: Z_INDEX.raised
    },
    ".doc-page": {
      maxWidth: "min(100%, calc(48rem * var(--doc-zoom, 1)))",
      margin: "0 auto",
      padding: `${sp(SPACING.xxl)} ${sp(SPACING.xxl)} ${sp(SPACING.xxxl)}`,
      position: "relative"
    },
    ".doc-input": {
      outline: "none",
      minHeight: "50vh",
      color: theme.vars.palette.text.primary,
      ...TYPOGRAPHY.sans.body,
      fontSize: `calc(${FONT_SIZE_SANS.body} * var(--doc-zoom, 1))`,
      lineHeight: 1.65,
      caretColor: theme.vars.palette.primary.main,
      userSelect: "text"
    },
    ".doc-placeholder": {
      position: "absolute",
      top: sp(SPACING.xxl),
      left: sp(SPACING.xxl),
      color: theme.vars.palette.text.disabled,
      pointerEvents: "none",
      userSelect: "none",
      ...TYPOGRAPHY.sans.body,
      fontSize: `calc(${FONT_SIZE_SANS.body} * var(--doc-zoom, 1))`,
      lineHeight: 1.65
    },
    ".doc-paragraph": { margin: `0 0 ${sp(SPACING.lg)}` },
    ".doc-h1, .doc-h2, .doc-h3, .doc-h4, .doc-h5, .doc-h6": {
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: 1.3,
      margin: `${sp(SPACING.xl)} 0 ${sp(SPACING.md)}`
    },
    ".doc-h1": { fontSize: `calc(${FONT_SIZE_SANS.title} * 1.6 * var(--doc-zoom, 1))` },
    ".doc-h2": { fontSize: `calc(${FONT_SIZE_SANS.title} * 1.3 * var(--doc-zoom, 1))` },
    ".doc-h3": { fontSize: `calc(${FONT_SIZE_SANS.title} * var(--doc-zoom, 1))` },
    ".doc-h4, .doc-h5, .doc-h6": { fontSize: `calc(${FONT_SIZE_SANS.body} * var(--doc-zoom, 1))` },
    ".doc-quote": {
      margin: `0 0 ${sp(SPACING.lg)}`,
      paddingLeft: sp(SPACING.lg),
      borderLeft: `${sp(SPACING.micro)} solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary
    },
    ".doc-ul, .doc-ol": {
      margin: `0 0 ${sp(SPACING.lg)}`,
      paddingLeft: sp(SPACING.xxl)
    },
    ".doc-li": { margin: `${sp(SPACING.micro)} 0` },
    ".doc-li-nested": { listStyleType: "none" },
    ".doc-li-checked, .doc-li-unchecked": {
      position: "relative",
      listStyleType: "none",
      marginLeft: `-${sp(SPACING.xl)}`,
      paddingLeft: sp(SPACING.xxl),
      outline: "none",
      "&::before": {
        content: '""',
        position: "absolute",
        left: 0,
        top: "0.3em",
        width: "1em",
        height: "1em",
        cursor: "pointer",
        borderRadius: BORDER_RADIUS.xs,
        border: `1px solid ${theme.vars.palette.text.secondary}`,
        transition: MOTION.background
      }
    },
    ".doc-li-checked": {
      color: theme.vars.palette.text.secondary,
      textDecoration: "line-through",
      "&::before": {
        backgroundColor: theme.vars.palette.primary.main,
        borderColor: theme.vars.palette.primary.main
      },
      "&::after": {
        content: '""',
        position: "absolute",
        left: "0.35em",
        top: "0.45em",
        width: "0.3em",
        height: "0.55em",
        cursor: "pointer",
        borderRight: `2px solid ${theme.vars.palette.primary.contrastText}`,
        borderBottom: `2px solid ${theme.vars.palette.primary.contrastText}`,
        transform: "rotate(45deg)"
      }
    },
    ".doc-link": {
      color: theme.vars.palette.c_link,
      textDecoration: "underline",
      cursor: "pointer"
    },
    ".doc-bold": { fontWeight: 600 },
    ".doc-italic": { fontStyle: "italic" },
    ".doc-strike": { textDecoration: "line-through" },
    ".doc-underline": { textDecoration: "underline" },
    ".doc-inline-code": {
      ...TYPOGRAPHY.mono.code,
      fontSize: `calc(${FONT_SIZE_MONO.code} * var(--doc-zoom, 1))`,
      backgroundColor: theme.vars.palette.action.selected,
      padding: `${sp(SPACING.micro)} ${sp(SPACING.xs)}`,
      borderRadius: BORDER_RADIUS.sm
    },
    ".doc-table": {
      borderCollapse: "collapse",
      margin: `0 0 ${sp(SPACING.lg)}`,
      width: "100%",
      tableLayout: "fixed"
    },
    ".doc-td, .doc-th": {
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: `${sp(SPACING.xs)} ${sp(SPACING.md)}`,
      verticalAlign: "top",
      textAlign: "left",
      "& p": { margin: 0 }
    },
    ".doc-th": {
      fontWeight: FONT_WEIGHT.semibold,
      backgroundColor: theme.vars.palette.action.hover
    },
    ...codeHighlightTokenStyles(theme),
    ".editor-code": {
      ...codeHighlightTokenStyles(theme)[".editor-code"],
      fontSize: `calc(${FONT_SIZE_MONO.code} * var(--doc-zoom, 1))`,
      borderRadius: BORDER_RADIUS.md,
      margin: `0 0 ${sp(SPACING.lg)}`
    },
    ".doc-paper-white": {
      backgroundColor: theme.vars.palette.common.white,
      color: theme.vars.palette.common.black
    },
    ".doc-paper-gray": {
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.common.white} 90%, ${theme.vars.palette.common.black})`,
      color: theme.vars.palette.common.black
    },
    ".doc-paper-white, .doc-paper-gray": {
      ".doc-input": {
        color: theme.vars.palette.common.black
      },
      ".doc-placeholder": {
        color: `color-mix(in srgb, ${theme.vars.palette.common.black} 42%, transparent)`
      },
      ".doc-quote": {
        color: `color-mix(in srgb, ${theme.vars.palette.common.black} 65%, transparent)`,
        borderLeftColor: `color-mix(in srgb, ${theme.vars.palette.common.black} 20%, transparent)`
      },
      ".doc-li-checked": {
        color: `color-mix(in srgb, ${theme.vars.palette.common.black} 55%, transparent)`
      },
      ".doc-li-unchecked::before": {
        borderColor: `color-mix(in srgb, ${theme.vars.palette.common.black} 55%, transparent)`
      },
      ".doc-inline-code": {
        backgroundColor: `color-mix(in srgb, ${theme.vars.palette.common.black} 8%, transparent)`
      },
      ".doc-td, .doc-th": {
        borderColor: `color-mix(in srgb, ${theme.vars.palette.common.black} 18%, transparent)`
      },
      ".doc-th": {
        backgroundColor: `color-mix(in srgb, ${theme.vars.palette.common.black} 6%, transparent)`
      },
      ".doc-link": {
        color: theme.vars.palette.primary.dark
      }
    }
  });
