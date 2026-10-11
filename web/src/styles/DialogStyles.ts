import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  MOTION,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx
} from "../components/ui_primitives";

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
      ...TYPOGRAPHY.sans.body,
      color: theme.vars.palette.text.primary,
      padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxl)}`
    },
    // MUI drops the content's top padding after a title; the title's divider
    // needs the gap back.
    ".dialog-title + .dialog-content": {
      paddingTop: getSpacingPx(SPACING.xl)
    },
    ".dialog-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeBig,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      wordSpacing: "normal",
      margin: 0,
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xxl)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".dialog-actions": {
      gap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xxl)}`,
      "& > :not(style) ~ :not(style)": {
        marginLeft: 0
      }
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
    }
  });

export default dialogStyles;
