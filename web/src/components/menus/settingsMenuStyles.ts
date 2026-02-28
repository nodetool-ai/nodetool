/** @jsxImportSource @emotion/react */
import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const settingsStyles = (theme: Theme): CSSObject => ({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  width: "100%",
  ".settings-tabs": {
    marginBottom: "1em",
    paddingTop: "0em",
    lineHeight: "1.5",
    "& .MuiTabs-indicator": {
      backgroundColor: "var(--palette-primary-main)",
      height: "3px",
      borderRadius: "1.5px"
    },
    "& .MuiTab-root": {
      color: theme.vars.palette.grey[200],
      transition: "color 0.2s ease",
      paddingBottom: "0em",
      "&.Mui-selected": {
        color: theme.vars.palette.grey[0]
      },
      "&:hover": {
        color: theme.vars.palette.grey[0]
      }
    }
  },
  ".tab-panel": {
    padding: "0",
    fontSize: theme.fontSizeNormal
  },
  ".tab-panel-content": {
    paddingBottom: "1em"
  },
  ".settings": {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1em",
    width: "100%",
    height: "100%",
    padding: ".5em 1em"
  },
  ".top": {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0em 1em",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    h2: {
      marginTop: "0",
      padding: "0.5em 0",
      color: theme.vars.palette.grey[0],
      fontSize: theme.fontSizeBigger,
      lineHeight: "1.5",
      fontWeight: "500"
    }
  },
  ".settings-menu": {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    width: "100%",
    fontSize: theme.fontSizeNormal
  },
  ".settings-container": {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  ".settings-sidebar": {
    width: "220px",
    minWidth: "220px",
    backgroundColor: theme.vars.palette.action.disabledBackground,
    padding: "1.5em 0",
    overflowY: "auto",
    borderRight: `1px solid ${theme.vars.palette.divider}`
  },
  ".settings-sidebar-item": {
    padding: "0.25em 1.5em",
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    color: theme.vars.palette.grey[0],
    opacity: "0.7",
    transition: "all 0.2s ease",
    borderLeft: "3px solid transparent",
    "&:hover": {
      opacity: 1,
      backgroundColor: theme.vars.palette.action.hover
    },
    "&.active": {
      opacity: 1,
      borderLeftColor: "var(--palette-primary-main)",
      backgroundColor: theme.vars.palette.action.selected
    }
  },
  ".settings-sidebar-category": {
    padding: "1em 1.5em 0.5em",
    color: "var(--palette-primary-main)",
    fontSize: theme.fontSizeSmaller,
    fontWeight: "500",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    opacity: "0.8"
  },
  ".sticky-header": {
    position: "sticky",
    top: 0,
    zIndex: 100,
    padding: "0 1em",
    display: "block",
    backgroundColor: "transparent",
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  },
  ".settings-content": {
    flex: 1,
    minWidth: 0,
    padding: "0 1em",
    overflowY: "auto",
    "&::-webkit-scrollbar": {
      width: "8px"
    },
    "&::-webkit-scrollbar-track": {
      background: theme.vars.palette.background.paper
    },
    "&::-webkit-scrollbar-thumb": {
      background: theme.vars.palette.action.disabledBackground,
      borderRadius: "4px"
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: theme.vars.palette.action.disabled
    }
  },
  ".settings-section": {
    backgroundColor: "transparent",
    backdropFilter: "blur(5px)",
    borderRadius: "8px",
    padding: "0.5em 1.2em 1.2em 1.2em",
    margin: "1.5em 0 1.5em 0",
    boxShadow: "0 2px 12px rgba(0, 0, 0, 0.2)",
    border: `1px solid ${theme.vars.palette.divider}`,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: ".8em",
    "&:first-of-type": {
      marginTop: "0.5em"
    }
  },
  ".settings-item.large": {
    ".MuiInputBase-root": {
      maxWidth: "unset !important"
    }
  },
  ".settings-item": {
    padding: "1em 0",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "&:last-child": {
      borderBottom: "none",
      paddingBottom: "0"
    },
    "&:first-of-type": {
      paddingTop: "0"
    },
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: ".8em",
    ".MuiInputBase-root": {
      maxWidth: "200px !important"
    },
    ".MuiFormControl-root": {
      width: "100%",
      minWidth: "unset",
      margin: "0",
      padding: "0 .5em",
      "& .MuiInputLabel-root": {
        position: "relative",
        transform: "none",
        marginBottom: "8px",
        fontWeight: "500",
        color: theme.vars.palette.grey[0],
        fontSize: theme.fontSizeNormal
      },
      "& .MuiInputBase-root": {
        maxWidth: "34em",
        backgroundColor: theme.vars.palette.background.paper,
        borderRadius: ".3em",
        margin: "0",
        padding: ".3em 1em",
        transition: "background-color 0.2s ease",
        fontSize: theme.fontSizeNormal,
        "&::before": {
          content: "none"
        }
      }
    },
    label: {
      color: theme.vars.palette.grey[0],
      fontSize: theme.fontSizeBig,
      fontWeight: "500",
      padding: ".5em 0 .25em 0"
    },
    ".description": {
      color: theme.vars.palette.grey[100],
      fontSize: theme.fontSizeNormal,
      margin: "0",
      padding: "0 1em 0 0.5em",
      lineHeight: "1.6",
      a: {
        color: "var(--palette-primary-main)",
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.10)`,
        padding: ".3em 1em",
        borderRadius: ".3em",
        marginTop: ".5em",
        display: "inline-block",
        textDecoration: "none",
        transition: "all 0.2s ease"
      }
    },
    ul: {
      margin: ".5em 0 0",
      padding: "0 0 0 1.2em",
      listStyleType: "square",
      li: {
        margin: "0.3em 0",
        color: theme.vars.palette.grey[100]
      }
    }
  },
  ".settings-header": {
    display: "flex",
    alignItems: "center",
    gap: "0.5em"
  },
  ".MuiSelect-select": {
    fontSize: theme.fontSizeNormal,
    padding: "0.4em 0.6em",
    marginTop: "0",
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: "8px",
    transition: "background-color 0.2s ease",
    "&:hover": {
      backgroundColor: theme.vars.palette.background.default
    }
  },
  ".MuiSwitch-root": {
    margin: "0"
  },
  ".secrets": {
    backgroundColor: `rgba(${theme.vars.palette.warning.mainChannel} / 0.12)`,
    backdropFilter: "blur(5px)",
    color: theme.vars.palette.text.primary,
    fontSize: theme.fontSizeBig,
    marginTop: ".8em",
    padding: ".8em 1em",
    borderRadius: ".3em",
    display: "flex",
    alignItems: "center",
    gap: ".8em",
    border: `1px solid ${theme.vars.palette.warning.main}`,
    boxShadow: "0 2px 8px rgba(255, 152, 0, 0.1)"
  },
  h2: {
    fontSize: theme.fontSizeBigger,
    color: theme.vars.palette.grey[0],
    margin: "0.5em 0 0.25em 0",
    padding: "0",
    fontWeight: "500"
  },
  h3: {
    fontSize: theme.fontSizeBigger,
    margin: "2em 0 0.5em 0",
    padding: "0.5em 0 0",
    fontWeight: "500",
    color: theme.vars.palette.grey[0],
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    paddingBottom: "0.3em"
  },
  ".settings-button": {
    transition: "transform 0.2s ease",
    "&:hover": {
      transform: "rotate(30deg)"
    }
  },
  "button.MuiButton-root": {
    borderRadius: ".3em",
    transition: "all 0.2s ease",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 4px 8px rgba(0,0,0,0.2)"
    }
  },
  ".MuiTypography-root": {
    fontSize: theme.fontSizeNormal
  },
  ".MuiMenuItem-root": {
    fontSize: theme.fontSizeNormal
  },
  ".MuiButton-root": {
    fontSize: theme.fontSizeNormal
  }
});
