import { css } from "@emotion/react";

const welcomeStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "#222",
      padding: "0 2em",
      borderRadius: ".5em",
      position: "fixed",
      width: "100vw",
      height: "100vh",
      top: "0",
      left: "0",
      overflowY: "hidden",
      border: `8px solid ${theme.palette.c_gray0}`,
      display: "flex",
      flexDirection: "column"
    },
    ".panel-title": {
      paddingLeft: "0",
      margin: 0,
      color: theme.palette.c_white,
      marginBottom: "1em"
    },
    ".summary": {
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSizeBigger,
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray1
    },
    ".content": {
      padding: "1em",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily,
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
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1
    },
    ".search": {
      marginBottom: "1em"
    },
    ".MuiAccordion-root": {
      background: "transparent",
      color: theme.palette.c_white,
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
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
      fontFamily: theme.fontFamily,
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
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black
    },
    ".tab-content": {
      marginTop: "1em"
    },
    ".link": {
      color: theme.palette.c_gray6,
      display: "inline-block",
      padding: "4px 8px",
      textDecoration: "none",
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "4px",
      transition: "all 0.2s"
    },
    ".link:hover": {
      color: theme.palette.c_black,
      backgroundColor: theme.palette.c_hl1
    },

    ".link-body": {
      fontSize: theme.fontSizeNormal,
      backgroundColor: "transparent",
      color: theme.palette.c_gray6,
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
      backgroundColor: "#222",
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
      backgroundColor: "#222",
      zIndex: 1,
      padding: "0",
      borderBottom: `1px solid ${theme.palette.c_gray3}`
    },
    ".overview button": {
      marginBottom: "1.5em",
      fontSize: theme.fontSizeNormal,
      padding: "1em 2em",
      transition: "all 0.2s"
    },
    ".overview button:hover:not(.Mui-selected)": {
      color: theme.palette.c_gray6
    },
    ".fake-button": {
      color: "#fff",
      backgroundColor: theme.palette.c_gray2,
      textTransform: "uppercase",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      padding: "0 .5em",
      margin: "0 .2em"
    },
    ".setup-tab h4, .setup-tab h5": {
      fontFamily: theme.fontFamily,
      marginBottom: "1em"
    },
    ".setup-tab .MuiListItemText-primary": {
      fontWeight: "bold",
      color: theme.palette.c_hl3
    },
    ".setup-tab .MuiListItemText-secondary": {
      color: theme.palette.c_white
    },
    ".remote-settings-container": {
      backgroundColor: theme.palette.c_gray1,
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
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig,
      outline: `1px solid ${theme.palette.c_hl1}`,
      flexGrow: 1,
      margin: "0",
      padding: "0.5em 8em",
      marginTop: "-.5em",
      borderRadius: ".2em",
      transition: "all 0.4s",
      "&:hover": {
        outline: `2px solid ${theme.palette.c_gray0}`,
        boxShadow: `inset 0 0 .2em 0 ${theme.palette.c_gray0}`,
        opacity: 0.9,
        color: theme.palette.c_black
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
      color: theme.palette.c_hl1
    },
    ".setup-list-content": {
      marginTop: ".25em"
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
    }
  });
export default welcomeStyles;
