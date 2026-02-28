import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

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
      padding: "0 .5em"
    },
    ".dialog-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[100],
      wordSpacing: "normal",
      margin: ".5em 0 0",
      padding: "1em"
    },
    ".dialog-title span": {
      borderBottom: `2px solid ${"var(--palette-primary-main)"}`
    },
    ".dialog-actions": {
      padding: ".5em 1em"
    },
    ".input-field": {
      padding: "8px 8px",
      marginBottom: "16px",
      width: "100%"
    },
    ".input-field input": {
      fontFamily: theme.fontFamily1,
      padding: "8px 12px",
      transition: "border-color 0.2s ease-in-out"
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
      fontWeight: "bold"
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
      margin: "0 0 1em",
      padding: ".5em 1em"
    },
    ".error-notice": {
      color: theme.vars.palette.grey[0],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: "0 0 1em",
      padding: ".5em 1em"
    },
    ".notice": {
      backgroundColor: theme.vars.palette.c_attention,
      color: theme.vars.palette.grey[1000],
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      padding: ".5em 1em"
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
      margin: "0 0 0 1em",
      padding: ".25em 1.5em",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      fontSize: theme.fontSizeSmaller
    },
    ".delete": {
      color: theme.vars.palette.c_delete
    }
  });

export default dialogStyles;
