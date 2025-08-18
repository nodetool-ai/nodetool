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
      },

      // Mobile styles are handled via separate CSS file
    },

    // Textarea and input styling
    ".compose-message textarea": {
      fontFamily: `${theme.fontFamily1} !important`,
      fontSize: `${theme.fontSizeNormal} !important`,
      backgroundColor: "transparent !important",
      color: `${theme.vars.palette.grey[0]} !important`,
      resize: "none",
      overflowY: "auto",
      flex: "1 !important",
      outline: "none !important",
      border: "0 !important",
      borderColor: "transparent !important",
      padding: "6px 10px 6px 6px !important",
      margin: "6px 0 !important",
      boxSizing: "border-box",
      transition: "border 0.2s ease-in-out",
      minHeight: "20px !important",
      maxHeight: "80px",
      lineHeight: "1.4 !important",
      width: "100% !important",
      display: "block !important",
      visibility: "visible",
      opacity: 1,
      
      "&::placeholder": {
        color: `${theme.vars.palette.grey[500]} !important`
      },
      "&:focus": {
        outline: "none !important",
        borderColor: "transparent !important",
        boxShadow: "none !important"
      },
      "&:disabled": {
        opacity: "0.6 !important",
        cursor: "not-allowed"
      },

      // Mobile styles handled via separate CSS file
    },

    // Additional input selectors - inherit from textarea styles
    ".compose-message .chat-input, .compose-message .MuiInputBase-input, .compose-message [role='textbox']": {
      fontFamily: `${theme.fontFamily1} !important`,
      fontSize: `${theme.fontSizeNormal} !important`,
      backgroundColor: "transparent !important",
      color: `${theme.vars.palette.grey[0]} !important`,
      resize: "none",
      flex: "1 !important",
      outline: "none !important",
      border: "0 !important",
      borderColor: "transparent !important",
      padding: "6px 10px 6px 6px !important",
      margin: "6px 0 !important",
      boxSizing: "border-box",
      minHeight: "20px !important",
      maxHeight: "80px",
      lineHeight: "1.4 !important",
      width: "100% !important",
      display: "block !important",
      
      // Mobile styles handled via separate CSS file
    },

    // Fallback for any nested textarea elements
    "textarea": {
      fontFamily: `${theme.fontFamily1} !important`,
      fontSize: `${theme.fontSizeNormal} !important`,
      backgroundColor: "transparent !important",
      color: `${theme.vars.palette.grey[0]} !important`,
      border: "none !important",
      outline: "none !important",
      resize: "none",
      minHeight: "20px !important",
      width: "100% !important",
      display: "block !important",
      visibility: "visible",
      opacity: 1
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
      
      // Mobile styles handled via separate CSS file
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      padding: "6px 8px",
      
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
