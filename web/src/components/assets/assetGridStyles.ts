/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const assetGridStyles = (theme: Theme) => {
  return css({
    "&": {
      display: "flex",
      marginTop: "16px",
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%",
      containerType: "inline-size"
    },

    // DROPZONE
    ".dropzone": {
      display: "flex",
      outline: "none",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      width: "100%",
      maxHeight: "calc(-260px + 100vh)"
    },
    ".audio-controls-container": {
      position: "absolute",
      width: "calc(100% - 32px)",
      left: "16px",
      bottom: "0",
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      zIndex: 5000,
      padding: "0.5em",
      borderTop: `2px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".controls .zoom": {
      maxWidth: "200px",
      paddingBottom: "0.5em"
    },
    ".current-folder": {
      display: "block",
      left: "0",
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[200],
      margin: "1em 0 0 0"
    },
    ".folder-slash": {
      color: theme.vars.palette.primary.main,
      fontWeight: 600,
      marginRight: "0.25em",
      userSelect: "none"
    },
    ".selected-asset-info": {
      fontSize: "12px !important",
      color: theme.vars.palette.grey[400],
      minHeight: "25px",
      padding: "0",
      margin: "0 0 0 0.5em"
    },
    ".folder-list-container": {
      padding: 0
    },
    ".folder-list": {
      listStyleType: "none",
      padding: 0,
      margin: 0
    },
    ".folder-item": {
      position: "relative",
      alignItems: "center",
      padding: 0,
      marginLeft: 0,
      borderRadius: ".5em"
    },
    ".folder-icon": {
      marginRight: "0.1em",
      color: theme.vars.palette.grey[500],
      verticalAlign: "middle",
      backgroundColor: "transparent"
    },
    ".folder-name": {
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[100],
      verticalAlign: "middle"
    },
    ".folder-item.selected ": {
      padding: 0,
      margin: 0,
      width: "100%",
      backgroundColor: theme.vars.palette.grey[800],
      "& .folder-name": {
        color: theme.vars.palette.grey[0],
        fontWeight: "600"
      },
      "& .folder-icon": {
        color: theme.vars.palette.c_folder
      }
    },
    ".root-folder": {
      paddingLeft: "4px"
    },
    ".file-info": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      "& > span": {
        textOverflow: "ellipsis",
        overflow: "hidden",
        whiteSpace: "nowrap",
        maxWidth: "200px"
      }
    },
    "@media (max-width: 520px)": {
      "&": {
        marginTop: "8px"
      },
      ".dropzone": {
        maxHeight: "calc(100vh - 140px)"
      },
      ".audio-controls-container": {
        left: "8px",
        width: "calc(100% - 16px)"
      }
    },
    "@container (max-width: 520px)": {
      ".header-info": {
        display: "none !important"
      }
    },
    // DOCKVIEW
    "& .dv-tabs-and-actions-container": {
      display: "none !important"
    },
    "& .dv-split-view-container .dv-view-container .dv-view": {
      padding: "0"
    },
    // resize handle
    "& .dv-split-view-container > .dv-sash-container > .dv-sash": {
      position: "relative",
      backgroundColor: "transparent",
      transition: "background-color 0.15s ease",
      borderRadius: "2px"
    },
    "& .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash":
      {
        width: "10px",
        cursor: "ew-resize",
        transform: "translate(0px, 0px)"
      },
    "& .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash::after":
      {
        content: '""',
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "2px",
        height: "30%",
        maxHeight: "100px",
        backgroundColor: theme.vars.palette.grey[300],
        borderRadius: "1px",
        opacity: 0.6,
        transition: "background-color 0.15s ease, opacity 0.15s ease"
      },
    "& .dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash": {
      height: "10px",
      cursor: "ns-resize",
      transform: "translate(0px, 0px)"
    },
    "& .dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash::after":
      {
        content: '""',
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "30%",
        maxWidth: "100px",
        height: "2px",
        backgroundColor: theme.vars.palette.grey[300],
        borderRadius: "1px",
        opacity: 0.6,
        transition: "background-color 0.15s ease, opacity 0.15s ease"
      },
    "& .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:hover::after":
      {
        backgroundColor: `${theme.vars.palette.primary.main} !important`,
        opacity: 1
      },
    "& .dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash:hover::after":
      {
        backgroundColor: `${theme.vars.palette.primary.main} !important`,
        opacity: 1
      }
  });
};

export default assetGridStyles;
