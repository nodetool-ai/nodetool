import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const createStyles = (theme: Theme) =>
  css({
    "& ": {
      width: "100%",
      display: "flex"
    },
    ".compose-message": {
      height: "auto",
      width: "100%",
      backgroundColor: theme.vars.palette.grey[600],
      border: "1px solid",
      borderColor: theme.vars.palette.grey[800],
      display: "flex",
      alignItems: "center",
      borderRadius: "16px",
      marginLeft: "1em",
      marginRight: "1em",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
      padding: "0px 6px 0px 12px",

      "&.dragging": {
        borderColor: "var(--palette-primary-main)",
        backgroundColor: `${theme.vars.palette.grey[600]}80`
      }
    },

    ".compose-message textarea": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[0],
      resize: "none",
      overflowY: "auto",
      flex: 1,
      outline: "none",
      border: "0",
      borderColor: "transparent",
      padding: "0px 1em 0px .5em",
      margin: "1em 0",
      boxSizing: "border-box",
      transition: "border 0.2s ease-in-out",
      "&::placeholder": {
        color: theme.vars.palette.grey[500]
      }
    },

    ".button-container": {
      display: "flex",
      alignItems: "center",
      flexDirection: "row",
      gap: "2px",
      flexShrink: 0,
      padding: "0 4px",
      "& button": {
        top: "0",
        padding: ".25em",
        position: "relative"
      }
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      padding: "4px 8px"
    },

    ".file-preview": {
      position: "relative",
      maxWidth: "24px",
      maxHeight: "24px",

      ".remove-button": {
        position: "absolute",
        top: -4,
        right: -4,
        padding: "0px 4px",
        background: "rgba(0, 0, 0, 0.7)",
        borderRadius: "50%",
        cursor: "pointer",
        color: "white",
        fontSize: "14px",
        lineHeight: "1.2",
        "&:hover": {
          background: "rgba(0, 0, 0, 0.9)"
        }
      },

      img: {
        width: "24px",
        height: "24px",
        objectFit: "cover",
        borderRadius: "4px"
      },

      ".file-icon-wrapper": {
        padding: "4px",
        borderRadius: "4px",
        textAlign: "center",
        width: "24px",
        height: "24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",

        svg: {
          fontSize: "24px"
        },

        ".file-name": {
          fontSize: "0.65em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "52px",
          marginTop: "2px"
        }
      }
    }
  });
