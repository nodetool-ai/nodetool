import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const tableStyles = (theme: Theme) =>
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
      border: `1px solid ${theme.vars.palette.grey[900]}`
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
      backgroundColor: theme.vars.palette.grey[800],
      borderTop: `1px solid ${theme.vars.palette.grey[900]}`
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
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".tabulator-row-even": {
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".tabulator-row:hover": {
      backgroundColor: theme.vars.palette.grey[600]
    },

    // Header
    ".tabulator .tabulator-header": {
      height: "2.5em",
      minHeight: "20px",
      maxHeight: "30px",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[200],
      fontWeight: "normal",
      borderBottom: `1px solid ${theme.vars.palette.grey[900]}`
    },
    ".tabulator .tabulator-header .tabulator-col": {
      minHeight: "2em",
      borderRight: `1px solid ${theme.vars.palette.grey[900]}`
    },
    ".tabulator .tabulator-header .tabulator-col-title": {
      lineHeight: "1.1em"
    },
    // Sorting arrow
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        transition: "border 0.15s"
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=ascending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderBottom: `6px solid ${"var(--palette-primary-main)"}`
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=descending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderTop: `6px solid ${"var(--palette-primary-main)"}`
      },

    // cell
    ".tabulator-row .tabulator-cell": {
      borderColor: theme.vars.palette.grey[900]
    },
    // Frozen column
    ".tabulator-row .tabulator-cell.tabulator-frozen": {
      paddingLeft: "2px !important",
      borderRight: `1px solid ${theme.vars.palette.grey[900]}`
    },
    ".tabulator .tabulator-header .tabulator-col .tabulator-col-content": {
      padding: "5px 0px 0px 2px"
    },

    // Table action buttons
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: ".1em",
      margin: ".4em 0 .2em 0",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2em",
      "& .disabled": {
        color: "var(--action-disabled)"
      },
      "& button": {
        padding: ".1em",
        width: ".8em",
        height: ".8em",
        "& svg": {
          width: "100%",
          height: "100%"
        },
        "&.disabled": {
          opacity: 0.5
        }
      }
    },

    // Datetime picker
    ".datetime-picker": {
      backgroundColor: "var(--palette-primary-main)"
    },
    ".tabulator .tabulator-cell.tabulator-editing.datetime input": {
      padding: ".5em",
      borderRadius: "8px",
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
        borderRadius: "8px",
        backgroundColor: "white",
        "&:hover svg": {
          color: "var(--palette-primary-main)"
        },
        "& svg": {
          color: theme.vars.palette.grey[1000],
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
      backgroundColor: theme.vars.palette.grey[0],
      color: theme.vars.palette.grey[1000],
      fontSize: theme.fontSizeSmall,
      "&::selection": {
        backgroundColor: "var(--palette-primary-main)"
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
