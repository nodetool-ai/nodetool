import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, SPACING, getSpacingPx } from "../components/ui_primitives";

const dialogStyles = (theme: Theme) =>
  css({
    "&": {
      position: "fixed",
      backgroundColor: "transparent",
      width: "100%",
      height: "100%",
      transform: "translate(0, 0)"
    },
    "& .MuiPaper-root": {
      minWidth: "min(320px, calc(100vw - 32px))"
    },
    ".dialog-content": {
      padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxl)}`
    },
    ".dialog-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeBig,
      fontWeight: 500,
      color: theme.vars.palette.grey[0],
      wordSpacing: "normal",
      margin: 0,
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xxl)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".dialog-title .panel-headline": {
      padding: 0
    },
    ".dialog-title > span, .dialog-title .headline-title": {
      borderBottom: `2px solid ${"var(--palette-primary-main)"}`
    },
    ".dialog-actions": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`
    },
    ".input-field": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.md)}`,
      marginBottom: getSpacingPx(SPACING.xl),
      width: "100%"
    },
    ".input-field input": {
      fontFamily: theme.fontFamily1,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
      transition: MOTION.border
    },
    ".input-field:hover fieldset": {
      borderColor: theme.vars.palette.grey[100]
    },
    ".input-field .Mui-focused fieldset": {
      borderColor: "var(--palette-primary-main)",
      borderWidth: "2px"
    },
    ".input-field .MuiOutlinedInput-root": {
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[100]
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "var(--palette-primary-main)",
        borderWidth: "2px"
      }
    },
    ".button-confirm": {
      color: "var(--palette-primary-main)",
      fontWeight: 600
    },
    ".button-confirm.MuiButton-containedError": {
      color: theme.vars.palette.error.contrastText
    },
    ".button-confirm:hover": {
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".button-cancel": {
      color: theme.vars.palette.grey[100]
    },
    ".error-message": {
      color: theme.vars.palette.grey[1000],
      backgroundColor: theme.vars.palette.error.main,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: `0 0 ${getSpacingPx(SPACING.xl)}`,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`
    },
    ".error-notice": {
      color: theme.vars.palette.grey[0],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: `0 0 ${getSpacingPx(SPACING.xl)}`,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`
    },
    ".notice": {
      backgroundColor: theme.vars.palette.c_attention,
      color: theme.vars.palette.grey[1000],
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`
    },
    ".notice span": {
      fontFamily: theme.fontFamily1
    },
    ".asset-names": {
      width: "90%",
      height: "100px",
      overflowY: "auto",
      backgroundColor: theme.vars.palette.grey[600],
      listStyleType: "square",
      margin: `0 0 0 ${getSpacingPx(SPACING.xl)}`,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xxl)}`,
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      fontSize: theme.fontSizeSmaller
    },
    ".delete": {
      color: theme.vars.palette.c_delete
    }
  });

export default dialogStyles;
