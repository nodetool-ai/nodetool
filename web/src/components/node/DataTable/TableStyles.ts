import { css } from "@emotion/react";

export const styles = (theme: any) =>
  css({
    "&.dicttable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden"
    },
    // rows
    ".tabulator-row": {
      minHeight: "20px",
      minWidth: "20px"
    },
    // header
    ".tabulator .tabulator-header": {
      minHeight: "20px",
      maxHeight: "30px",
      fontFamily: theme.fontFamily2,
      wordSpacing: "-.2em",
      fontWeight: "normal"
    },
    // actions
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: ".5em",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2em"
    },
    ".table-actions .disabled": {
      opacity: 0.5
    },
    ".table-actions button": {
      lineHeight: "1em",
      textAlign: "left",
      padding: ".5em",
      border: 0,
      fontSize: theme.fontSizeTinyer,
      color: theme.palette.c_gray6,
      margin: "0",
      borderRadius: "0",
      backgroundColor: theme.palette.c_gray0
    },
    ".table-actions button:hover": {
      color: theme.palette.c_hl1
    }
  });
