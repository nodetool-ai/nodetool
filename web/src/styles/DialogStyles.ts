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
      maxWidth: "300px"
    },
    ".dialog-content": {
      padding: "0 .5em"
    },
    ".dialog-title": {
      fontFamily: theme.fontFamily1,
      wordSpacing: "normal",
      margin: ".5em 0 0",
      padding: "1em"
    },
    ".dialog-title span": {
      borderBottom: `2px solid ${theme.palette.c_hl1}`
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
      borderColor: theme.palette.c_gray6
    },
    ".input-field .Mui-focused fieldset": {
      borderColor: theme.palette.c_hl1,
      borderWidth: "2px"
    },
    ".input-field .MuiOutlinedInput-root": {
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.c_gray6
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.c_hl1,
        borderWidth: "2px"
      }
    },
    ".button-confirm": {
      color: theme.palette.c_hl1,
      fontWeight: "bold"
    },
    ".button-confirm:hover": {
      backgroundColor: theme.palette.c_gray0
    },
    ".button-cancel": {
      color: theme.palette.c_gray6
    },
    ".error-message": {
      color: theme.palette.c_black,
      backgroundColor: theme.palette.c_error,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: "0 0 1em",
      padding: ".5em 1em"
    },
    ".error-notice": {
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: "0 0 1em",
      padding: ".5em 1em"
    },
    ".notice": {
      backgroundColor: theme.palette.c_attention,
      color: theme.palette.c_black,
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
      backgroundColor: theme.palette.c_gray2,
      listStyleType: "square",
      margin: "0 0 0 1em",
      padding: ".25em 1.5em",
      borderBottom: `1px solid ${theme.palette.c_gray1}`,
      fontSize: theme.fontSizeSmaller
    },
    ".delete": {
      color: theme.palette.c_delete
    }
  });

export default dialogStyles;
