import { css } from "@emotion/react";

const dialogStyles = (theme: any) =>
  css({
    "&": {
      position: "fixed",
      backgroundColor: "transparent",
      width: "400px",
      height: "400px",
      maxHeight: "400px",
      transform: "translate(0, 0)"
    },
    ".dialog-content": {
      padding: "0 1em"
    },
    ".dialog-title": {
      margin: ".5em 0 0",
      padding: "1em"
    },
    ".dialog-title span": {
      borderBottom: `2px solid ${theme.palette.c_attention}`
    },
    ".dialog-actions": {
      padding: ".5em 1em"
    },
    ".input-field": {
      padding: ".5em"
    },
    ".input-field input": {
      fontFamily: theme.fontFamily1
    },
    ".input-field:hover fieldset": {
      border: "1px solid gray"
    },
    ".input-field .Mui-focused fieldset": {
      border: "1px solid white"
    },
    ".button-confirm": {
      color: theme.palette.c_attention,
      fontWeight: "bold"
    },
    ".button-confirm:hover": {
      backgroundColor: theme.palette.c_gray0
    },
    ".button-cancel": {
      color: theme.palette.c_gray6
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
    }
  });

export default dialogStyles;
