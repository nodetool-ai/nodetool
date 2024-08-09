import { css } from "@emotion/react";

export const styles = (theme: any) =>
  css({
    // Main container
    "&.dicttable, &.datatable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden",
    },

    // Tabulator base
    ".tabulator": {
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1,
      height: "200px",
    },
    ".tabulator-tableholder": {
      overflow: "auto",
      paddingBottom: "4em",
      backgroundColor: theme.palette.c_gray2,
    },

    // Column resize handle
    ".tabulator .tabulator-col-resize-handle": {
      position: "relative",
      display: "inline-block",
      width: "6px",
      margin: "0 -3px",
      zIndex: 11,
      verticalAlign: "middle",
    },

    // Row
    ".tabulator-row": {
      minHeight: "20px",
      minWidth: "20px",
      fontSize: theme.fontSizeSmaller,
    },

    // Header
    ".tabulator .tabulator-header": {
      height: "2.5em",
      minHeight: "20px",
      maxHeight: "30px",
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray5,
      fontWeight: "normal",
    },

    // Sorting arrow
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        transition: "border 0.2s",
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=ascending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderBottom: `4px solid ${theme.palette.c_hl1}`,
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=descending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderTop: `4px solid ${theme.palette.c_hl1}`,
      },

    // Frozen column
    ".tabulator-row .tabulator-cell.tabulator-frozen": {
      paddingLeft: "2px !important",
    },
    ".tabulator .tabulator-header .tabulator-col .tabulator-col-content": {
      padding: "5px 0px 0px 2px",
    },

    // Table action buttons
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: "1px",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2.5em",
      "& .disabled": {
        opacity: 0.5,
      },
      "& button": {
        minHeight: "3em",
        lineHeight: "1em",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        border: 0,
        fontSize: theme.fontSizeTinyer,
        color: theme.palette.c_gray6,
        margin: "0",
        borderRadius: "0",
        backgroundColor: theme.palette.c_gray0,
        "&:hover": {
          color: theme.palette.c_hl1,
        },
      },
    },

    // Toggle button
    ".toggle": {
      height: "2em",
      display: "flex",
      flexDirection: "column",
      gap: ".5em",
      padding: "0",
      margin: "0",
      "& .MuiToggleButton-root": {
        fontSize: theme.fontSizeTinyer,
        color: theme.palette.c_gray5,
        backgroundColor: theme.palette.c_gray0,
        margin: "0",
        border: 0,
        borderRadius: "0",
        lineHeight: "1em",
        textAlign: "left",
        padding: ".5em",
        "&:hover, &.Mui-selected:hover": {
          color: theme.palette.c_hl1,
        },
        "&.Mui-selected": {
          color: theme.palette.c_white,
        },
      },
    },

    // Datetime picker
    ".datetime-picker": {
      backgroundColor: theme.palette.c_hl1,
    },
    ".tabulator .tabulator-cell.tabulator-editing.datetime input": {
      padding: ".5em",
      borderRadius: "0",
      backgroundColor: "white",
    },
    ".datetime": {
      "& button": {
        position: "absolute",
        width: "20px",
        height: "20px",
        padding: 0,
        top: "0",
        right: ".5em",
        borderRadius: "0",
        backgroundColor: "white",
        "&:hover svg": {
          color: theme.palette.c_hl1,
        },
        "& svg": {
          color: theme.palette.c_black,
          width: "100%",
          height: "100%",
        },
      },
      "& fieldset": {
        border: 0,
      },
    },

    // Cell editing
    ".tabulator .tabulator-cell.tabulator-editing input": {
      backgroundColor: theme.palette.c_white,
      color: theme.palette.c_black,
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1,
      "&::selection": {
        backgroundColor: theme.palette.c_hl1,
      },
    },

    // Row select
    ".tabulator-row .tabulator-cell.row-select, .tabulator .tabulator-header .tabulator-col.row-select .tabulator-col-content, .tabulator-header .tabulator-col.row-select":
      {
        width: "25px !important",
        minWidth: "25px !important",
        textAlign: "left",
        padding: "0 !important",
      },
  });
