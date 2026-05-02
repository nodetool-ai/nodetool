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
  ".settings-page-header": {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "1.25rem",
    padding: "1.25rem 1.75rem 1rem",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "& .settings-back": {
      flexShrink: 0
    },
    "& .settings-page-header__titles": {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      minWidth: 0
    },
    "& .settings-page-header__title": {
      margin: 0,
      color: theme.vars.palette.text.primary,
      fontSize: "1.5rem",
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.01em"
    },
    "& .settings-page-header__subtitle": {
      margin: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.4
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
  ".settings-container--api-keys": {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  ".settings-content--api-keys": {
    padding: "1.5rem 1rem",
    overflowY: "auto",
    overflowX: "hidden"
  },
  ".settings-sidebar": {
    width: "220px",
    minWidth: "220px",
    backgroundColor: theme.vars.palette.background.default,
    padding: "1.5em 0",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column"
  },
  ".settings-sidebar-footer": {
    marginTop: "auto",
    padding: "1em 0.75em 0.5em"
  },
  ".settings-sidebar-folder": {
    display: "flex",
    flexDirection: "column",
    "& + &": {
      marginTop: "0.25em"
    }
  },
  ".settings-sidebar-folder-items": {
    display: "flex",
    flexDirection: "column",
    paddingBottom: "0.25em"
  },
  ".settings-sidebar-item": {
    padding: "0.25em 1.5em 0.25em 2.75em",
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    color: theme.vars.palette.grey[0],
    opacity: "0.7",
    transition: "all 0.2s ease",
    borderLeft: "2px solid transparent",
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
    display: "flex",
    alignItems: "center",
    gap: "0.4em",
    padding: "0.6em 1em 0.4em 0.75em",
    color: theme.vars.palette.grey[0],
    fontSize: theme.fontSizeSmaller,
    fontWeight: "600",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    opacity: "0.85",
    cursor: "pointer",
    userSelect: "none",
    transition: "all 0.15s ease",
    borderRadius: "var(--rounded-sm)",
    outline: "none",
    "&:hover": {
      opacity: 1,
      backgroundColor: theme.vars.palette.action.hover
    },
    "&:focus-visible": {
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    },
    "&.open .settings-sidebar-chevron": {
      transform: "rotate(0deg)"
    },
    ".settings-sidebar-chevron": {
      fontSize: "1rem",
      color: theme.vars.palette.text.secondary,
      transition: "transform 0.18s ease",
      transform: "rotate(-90deg)"
    },
    ".settings-sidebar-folder-icon": {
      fontSize: "1.05rem",
      color: "var(--palette-primary-main)"
    },
    ".settings-sidebar-category-label": {
      flex: 1
    }
  },
  ".sticky-header": {
    position: "sticky",
    top: 0,
    zIndex: 100,
    padding: "0 1em",
    display: "block",
    backgroundColor: "transparent"
  },
  ".settings-content": {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
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
      borderRadius: "var(--rounded-sm)"
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: theme.vars.palette.action.disabled
    }
  },
  ".settings-content--full": {
    padding: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    "& .tab-panel": {
      display: "none",
      flex: 1,
      minHeight: 0
    },
    "& .tab-panel:not([hidden])": {
      display: "flex"
    },
    "& .tab-panel-content": {
      flex: 1,
      minHeight: 0,
      paddingBottom: 0,
      display: "flex",
      flexDirection: "column"
    },
    "& .settings-panel-padded": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      padding: "1.25rem 1.75rem"
    }
  },
  ".settings-section": {
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
    margin: "1.5em 0",
    boxShadow: "none",
    border: "0 none",

    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: ".5em",
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
    padding: "0 0 .1em 0",
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
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: ".3em",
        margin: "0",
        padding: ".3em 1em",
        transition: "border-color 0.2s ease, background-color 0.2s ease",
        fontSize: theme.fontSizeNormal,
        "&:hover": {
          borderColor: theme.vars.palette.grey[300]
        },
        "&.Mui-focused": {
          borderColor: theme.vars.palette.primary.main
        },
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
      color: theme.vars.palette.grey[50],
      opacity: 0.5,
      fontSize: theme.fontSizeSmall,
      margin: "0",
      padding: "0",
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
    borderRadius: "var(--rounded-lg)",
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
