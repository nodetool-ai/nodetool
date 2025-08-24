import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const createStyles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: "44px",
    ".compose-message": {
      height: "auto",
      width: "100%",
      marginTop: "12px",
      backgroundColor: theme.vars.palette.grey[800],
      border: "1px solid",
      borderColor: theme.vars.palette.grey[700],
      display: "flex",
      alignItems: "center",
      borderRadius: 16,
      boxShadow: "0 1px 0 rgba(0,0,0,0.25)",
      padding: "8px 12px",
      minHeight: "44px",
      maxHeight: "120px",
      boxSizing: "border-box",
      position: "relative",
      visibility: "visible",
      opacity: 1,

      "&.dragging": {
        borderColor: "var(--palette-primary-main)",
        backgroundColor: `${theme.vars.palette.grey[800]}80`
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
      padding: "6px 10px 6px 6px",
      margin: "6px 0",
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
      gap: "6px",
      flexShrink: 0,
      padding: "0 6px",
      "& button": {
        top: "0",
        padding: "6px",
        position: "relative",
        borderRadius: 12
      }

      // Mobile styles handled via separate CSS file
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      padding: "6px 8px"

      // Mobile styles handled via separate CSS file
    },

    ".file-preview": {
      position: "relative",
      maxWidth: "24px",
      maxHeight: "24px",
      flexShrink: 0,

      // Mobile styles handled via separate CSS file

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
