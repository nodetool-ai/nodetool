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
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      display: "flex",
      alignItems: "center",
      borderRadius: 24,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      padding: "8px 12px",
      minHeight: "44px",
      maxHeight: "120px",
      boxSizing: "border-box",
      position: "relative",
      visibility: "visible",
      opacity: 1,
      transition: "all 0.2s ease",

      "&:focus-within": {
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
      },

      "&.dragging": {
        borderColor: "var(--palette-primary-main)",
        backgroundColor: `${theme.vars.palette.grey[800]}80`
      },

      // Mobile responsive styles
      [theme.breakpoints.down("sm")]: {
        padding: "6px 8px",
        marginTop: "8px",
        borderRadius: 20,
        minHeight: "40px",
        maxHeight: "100px"
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
      },
      // Mobile responsive font size
      [theme.breakpoints.down("sm")]: {
        fontSize: theme.fontSizeSmall,
        padding: "4px 8px 4px 4px",
        margin: "4px 0"
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
      },

      // Mobile responsive gap and padding
      [theme.breakpoints.down("sm")]: {
        gap: "4px",
        padding: "0 4px",
        "& button": {
          padding: "4px",
          borderRadius: 10
        }
      }
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      padding: "6px 8px",

      // Mobile responsive gap and padding
      [theme.breakpoints.down("sm")]: {
        gap: "4px",
        padding: "4px 6px"
      }
    },

    ".file-preview": {
      position: "relative",
      maxWidth: "24px",
      maxHeight: "24px",
      flexShrink: 0,

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
