import { css } from "@emotion/react";

export const styles = (theme: any) =>
  css({
    "&.dicttable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden",
    },
    // rows
    ".tabulator-row": {
      minHeight: "20px",
      minWidth: "20px",
      fontSize: theme.fontSizeSmaller,
    },
    // header
    ".tabulator .tabulator-header": {
      height: "2.5em",
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray5,
      fontWeight: "normal",
    },
    // actions
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: ".5em",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2em",
    },
    ".table-actions .disabled": {
      opacity: 0.5,
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
      backgroundColor: theme.palette.c_gray0,
    },
    ".table-actions button:hover": {
      color: theme.palette.c_hl1,
    },
    // columns
    ".tabulator-row .tabulator-cell.tabulator-frozen": {
      paddingLeft: "2px !important",
    },
    ".tabulator .tabulator-header .tabulator-col .tabulator-col-content": {
      padding: "5px 0px 0px 2px",
    },
  });
