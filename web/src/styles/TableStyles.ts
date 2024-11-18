import { css } from "@emotion/react";

export const tableStyles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    width: "100%",
    // Main container
    ".dicttable, .datatable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.palette.c_gray0}`
    },

    // Tabulator base
    ".tabulator": {
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily1,
      height: "200px"
    },
    ".tabulator-tableholder": {
      overflow: "auto",
      paddingBottom: "4em",
      backgroundColor: theme.palette.c_gray1,
      borderTop: `1px solid ${theme.palette.c_gray0}`
    },

    // Column resize handle
    ".tabulator .tabulator-col-resize-handle": {
      position: "absolute",
      // display: "inline-block",
      right: "5em",
      width: "6px",
      margin: "0 -3px",
      zIndex: 11,
      verticalAlign: "middle"
    },

    // Row
    ".tabulator-row": {
      minHeight: "15px",
      minWidth: "20px",
      fontSize: theme.fontSizeSmall,
      backgroundColor: theme.palette.c_gray0
    },
    ".tabulator-row-even": {
      backgroundColor: theme.palette.c_gray1
    },
    ".tabulator-row:hover": {
      backgroundColor: theme.palette.c_gray2
    },

    // Header
    ".tabulator .tabulator-header": {
      height: "2.5em",
      minHeight: "20px",
      maxHeight: "30px",
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray5,
      fontWeight: "normal",
      borderBottom: `1px solid ${theme.palette.c_gray0}`
    },
    ".tabulator .tabulator-header .tabulator-col": {
      minHeight: "2em",
      borderRight: `1px solid ${theme.palette.c_gray0}`
    },
    // Sorting arrow
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        transition: "border 0.2s"
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=ascending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderBottom: `4px solid ${theme.palette.c_hl1}`
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=descending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderTop: `4px solid ${theme.palette.c_hl1}`
      },

    // cell
    ".tabulator-row .tabulator-cell": {
      borderColor: theme.palette.c_gray0
    },
    // Frozen column
    ".tabulator-row .tabulator-cell.tabulator-frozen": {
      paddingLeft: "2px !important",
      borderRight: `1px solid ${theme.palette.c_gray0}`
    },
    ".tabulator .tabulator-header .tabulator-col .tabulator-col-content": {
      padding: "5px 0px 0px 2px"
    },

    // Table action buttons
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: ".25em",
      marginBottom: ".5em",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2em",
      "& .disabled": {
        opacity: 0.5
      },
      "& button": {
        height: "3em",
        maxWidth: "6em",
        lineHeight: "1.1em",
        textAlign: "center",
        display: "flex",
        alignItems: "center",
        border: 0,
        fontSize: theme.fontSizeTinyer,
        color: theme.palette.c_gray6,
        margin: "0",
        borderRadius: "0",
        backgroundColor: theme.palette.c_gray0,
        "&:hover": {
          color: theme.palette.c_hl1
        }
      }
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
        lineHeight: "1.1em",
        color: theme.palette.c_gray4,
        backgroundColor: theme.palette.c_gray0,
        margin: "0",
        border: 0,
        borderRadius: "0",
        textAlign: "left",
        padding: ".5em",
        "&:hover, &.Mui-selected:hover": {
          color: theme.palette.c_hl1
        },
        "&.Mui-selected": {
          color: theme.palette.c_white
        }
      }
    },

    // Datetime picker
    ".datetime-picker": {
      backgroundColor: theme.palette.c_hl1
    },
    ".tabulator .tabulator-cell.tabulator-editing.datetime input": {
      padding: ".5em",
      borderRadius: "0",
      backgroundColor: "white"
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
          color: theme.palette.c_hl1
        },
        "& svg": {
          color: theme.palette.c_black,
          width: "100%",
          height: "100%"
        }
      },
      "& fieldset": {
        border: 0
      }
    },

    // Cell editing
    ".tabulator .tabulator-cell.tabulator-editing input": {
      backgroundColor: theme.palette.c_white,
      color: theme.palette.c_black,
      fontSize: theme.fontSizeSmall,
      "&::selection": {
        backgroundColor: theme.palette.c_hl1
      }
    },

    // Row select
    ".tabulator-row .tabulator-cell.row-select, .tabulator .tabulator-header .tabulator-col.row-select .tabulator-col-content, .tabulator-header .tabulator-col.row-select":
      {
        width: "25px !important",
        minWidth: "25px !important",
        textAlign: "left",
        padding: "0 !important"
      }
  });
