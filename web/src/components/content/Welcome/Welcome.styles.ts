import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

const welcomeStyles = (theme: Theme) =>
  css({
    "&": {
      backgroundColor: theme.vars.palette.background.default,
      padding: "0 2em",
      borderRadius: ".5em",
      position: "fixed",
      width: "100vw",
      height: "100vh",
      top: "0",
      left: "0",
      overflowY: "hidden",
      border: `8px solid ${theme.vars.palette.grey[900]}`,
      display: "flex",
      flexDirection: "column"
    },
    ".panel-title": {
      paddingLeft: "0",
      margin: 0,
      color: theme.vars.palette.grey[0],
      marginBottom: 0
    },
    ".subtitle": {
      color: theme.vars.palette.grey[300],
      marginTop: ".25em"
    },
    ".summary": {
      fontSize: theme.fontSizeBigger,
      color: "var(--palette-primary-main)",
      backgroundColor: theme.vars.palette.background.paper
    },
    ".content": {
      padding: "1em",
      color: theme.vars.palette.grey[0],
      fontSize: theme.fontSizeBig
    },

    ".content ul": {
      marginLeft: "0",
      paddingLeft: "1em"
    },
    ".content ul li": {
      listStyleType: "square",
      marginLeft: "0",
      marginBottom: 0,
      fontSize: theme.fontSizeNormal
    },
    ".search": {
      margin: "1em 0 -1em 0",
      width: "50%",
      maxWidth: "500px"
    },
    ".MuiAccordion-root": {
      color: theme.vars.palette.grey[0],
      borderBottom: `1px solid ${theme.vars.palette.grey[500]}`,
      backgroundColor: theme.vars.palette.background.paper,
      marginBottom: "1em",
      "&:before": {
        display: "none"
      }
    },
    ".MuiAccordionSummary-content.Mui-expanded": {
      margin: "0"
    },
    ".MuiAccordionSummary-root": {
      minHeight: "48px"
    },
    ".MuiAccordionSummary-content": {
      margin: ".5em 0"
    },
    ".MuiTypography-root": {
      lineHeight: "1.5em"
    },
    ".MuiListItemText-primary": {
      fontWeight: "bold"
    },
    "ul, ol": {
      fontFamily: theme.fontFamily1,
      paddingLeft: ".5em",
      margin: ".5em 0",
      "& li": {
        marginBottom: "0.5em"
      }
    },
    ".highlight": {
      color: theme.vars.palette.grey[1000]
    },
    ".tab-content": {
      marginTop: "1em"
    },
    ".quick-start": {
      borderRadius: "12px",
      padding: "10px 12px",
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".quick-start-grid": {
      marginTop: "2px"
    },
    ".quick-card": {
      borderRadius: "8px",
      transition: "transform .15s ease, border-color .15s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: "var(--palette-primary-main)"
      }
    },
    ".quick-card .MuiCardContent-root": {
      padding: "10px 12px"
    },
    ".quick-card-icon": {
      fontSize: "22px",
      color: "var(--palette-primary-main)"
    },
    ".quick-card-title": {
      marginTop: "4px",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig
    },
    ".quick-card-desc": {
      opacity: 0.85,
      marginTop: "2px",
      fontSize: "0.9em",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical" as unknown as undefined,
      overflow: "hidden"
    },
    ".link": {
      color: theme.vars.palette.grey[100],
      display: "inline-block",
      padding: "4px 8px",
      textDecoration: "none",
      borderRadius: "4px",
      transition: "all 0.2s"
    },
    ".link:hover": {
      color: theme.vars.palette.grey[1000]
    },

    ".link-body": {
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[100],
      marginTop: ".25em",
      marginBottom: "2em",
      display: "block"
    },

    ".header-container": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".header": {
      position: "sticky",
      top: 0,
      zIndex: 1,
      padding: "1.5em 0em 0 0em",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1em"
    },
    ".header-right": {
      display: "flex",
      alignItems: "center",
      gap: "1em"
    },
    ".show-on-startup-toggle": {
      marginTop: "-1em"
    },
    ".content-area": {
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 100px)",
      gap: "2em"
    },
    ".tabs-and-search": {
      position: "sticky",
      top: 0,
      zIndex: 1,
      padding: "0"
    },
    ".overview button": {
      fontSize: theme.fontSizeNormal,
      marginBottom: "0",
      padding: "0 2em",
      transition: "all 0.2s"
    },
    ".overview button:hover:not(.Mui-selected)": {
      color: theme.vars.palette.grey[100]
    },
    ".fake-button": {
      color: "#fff",
      textTransform: "uppercase",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      padding: "0 .5em",
      margin: "0 .2em"
    },
    ".setup-tab h4, .setup-tab h5": {
      fontFamily: theme.fontFamily2,
      marginBottom: "1em"
    },
    ".setup-tab .MuiListItemText-primary": {
      fontWeight: "bold",
      color: theme.vars.palette.primary.main
    },
    ".setup-tab .MuiListItemText-secondary": {
      color: theme.vars.palette.grey[0]
    },
    ".remote-settings-container": {
      backgroundColor: theme.vars.palette.grey[800],
      padding: "1.5em",
      borderRadius: "8px"
    },
    ul: {
      paddingLeft: "1.5em"
    },
    "ul li, ol li": {
      margin: 0,
      listStyleType: "square"
    },
    ".start-button": {
      backgroundColor: "var(--palette-primary-main)",
      color: theme.vars.palette.grey[1000],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig,
      outline: `1px solid ${"var(--palette-primary-main)"}`,
      flexGrow: 1,
      margin: "0",
      padding: "0.5em 8em",
      marginTop: "-.5em",
      borderRadius: ".2em",
      transition: "all 0.4s",
      "&:hover": {
        outline: `2px solid ${theme.vars.palette.grey[900]}`,
        boxShadow: `inset 0 0 .2em 0 ${theme.vars.palette.grey[900]}`,
        opacity: 0.9,
        color: theme.vars.palette.grey[1000]
      }
    },
    // ".MuiTabs-root": {
    //   marginBottom: "1.5em",
    //   "& .MuiTab-root": {
    //     fontSize: theme.fontSizeBig,
    //     padding: "1em 2em",
    //     transition: "all 0.2s"
    //   }
    // },
    ".setup-list-item": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start"
    },
    ".setup-list-title": {
      fontWeight: "bold",
      paddingTop: ".5em",
      color: "var(--palette-primary-main)"
    },
    ".setup-list-content": {
      marginTop: ".25em"
    },
    ".step-list": {
      marginTop: ".25em",
      paddingLeft: "1.25em",
      "& li": { marginBottom: ".5em" }
    },
    ".callout": {
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: 8,
      padding: "8px 12px"
    },
    ".setup-list-secondary": {
      "& ul": {
        marginTop: "1em"
      },
      "& li": {
        marginBottom: "0.5em"
      }
    },
    ".setup-description": {
      marginTop: "2em",
      "& p": {
        marginTop: "1em"
      }
    },

    // Local Models section styling
    ".local-models": {
      display: "flex",
      flexDirection: "column",
      gap: "0.75em"
    },
    ".local-models .section-title": {
      marginBottom: 0
    },
    ".local-models .section-subtitle": {
      opacity: 0.9
    },
    ".models-heading": {
      marginTop: "0.75em",
      marginBottom: "0.25em"
    },
    ".local-models-list": {
      listStyleType: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "0.75em"
    },
    ".local-model-item": {
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: 10,
      padding: "12px 14px"
    },
    ".local-model-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1em"
    },
    ".local-model-title": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },
    ".local-model-badges": {
      display: "flex",
      alignItems: "center",
      gap: 6
    },
    ".local-model-actions": {
      display: "flex",
      alignItems: "center"
    },
    ".model-variant-buttons": {
      "& .inline-download-progress": {
        "& .MuiTypography-root": {
          fontFamily: theme.fontFamily2
        }
      }
    },
    ".local-model-desc": {
      marginTop: 6,
      opacity: 0.95
    },
    ".model-note": {
      color: theme.vars.palette.warning.main,
      marginTop: 4
    }
  });
export default welcomeStyles;
