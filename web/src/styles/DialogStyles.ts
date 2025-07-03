import { css } from "@emotion/react";

const dialogStyles = (theme: any) =>
  css({
    "&": {
      position: "fixed",
      backgroundColor: "transparent",
      width: "400px",
      height: "300px",
      maxHeight: "400px",
      transform: "translate(0, 0)"
    },
    "& .MuiPaper-root": {
      width: "100%",
      maxWidth: "400px"
    },
    ".dialog-content": {
      padding: "0 .5em"
    },
    ".dialog-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.palette.grey[100],
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
      borderColor: theme.palette.grey[100]
    },
    ".input-field .Mui-focused fieldset": {
      borderColor: "var(--palette-primary-main)",
      borderWidth: "2px"
    },
    ".input-field .MuiOutlinedInput-root": {
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.grey[100]
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
      backgroundColor: theme.palette.grey[900]
    },
    ".button-cancel": {
      color: theme.palette.grey[100]
    },
    ".error-message": {
      color: theme.palette.grey[1000],
      backgroundColor: theme.palette.error.main,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: "0 0 1em",
      padding: ".5em 1em"
    },
    ".error-notice": {
      color: theme.palette.grey[0],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: "0 0 1em",
      padding: ".5em 1em"
    },
    ".notice": {
      backgroundColor: theme.palette.c_attention,
      color: theme.palette.grey[1000],
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
      backgroundColor: theme.palette.grey[600],
      listStyleType: "square",
      margin: "0 0 0 1em",
      padding: ".25em 1.5em",
      borderBottom: `1px solid ${theme.palette.grey[800]}`,
      fontSize: theme.fontSizeSmaller
    },
    ".delete": {
      color: theme.palette.c_delete
    }
  });

export default dialogStyles;
