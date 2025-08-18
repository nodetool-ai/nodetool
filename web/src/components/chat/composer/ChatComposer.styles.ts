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

      // Mobile: single row layout with direct children inline
      [theme.breakpoints.down("sm")]: {
        borderRadius: 8,
        padding: "6px 8px",
        height: "40px",
        minHeight: "40px",
        maxHeight: "40px",
        margin: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "nowrap",
        overflow: "visible",
        gap: "4px",
        boxSizing: "border-box"
      }
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

      // Mobile: single line input takes remaining space
      [theme.breakpoints.down("sm")]: {
        fontSize: "16px !important", // Prevent zoom on iOS
        padding: "0 6px !important",
        margin: "0 !important",
        height: "28px !important",
        minHeight: "28px !important",
        maxHeight: "28px !important",
        lineHeight: "28px !important", // Center text vertically
        flex: "1 !important", // Take available space
        overflow: "hidden",
        textOverflow: "ellipsis",
        resize: "none !important",
        borderRadius: "6px !important",
        boxSizing: "border-box !important",
        border: "none !important",
        outline: "none !important"
      }
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
      
      // Mobile styles
      [theme.breakpoints.down("sm")]: {
        fontSize: "16px !important",
        padding: "0 6px !important",
        margin: "0 !important",
        height: "28px !important",
        minHeight: "28px !important",
        maxHeight: "28px !important",
        lineHeight: "28px !important",
        flex: "1 !important",
        boxSizing: "border-box !important",
        border: "none !important",
        outline: "none !important"
      }
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
      
      // Mobile: compact buttons for single row
      [theme.breakpoints.down("sm")]: {
        gap: "2px",
        padding: "0 2px",
        flexShrink: 0,
        "& button": {
          padding: "4px",
          minWidth: "28px",
          width: "28px",
          height: "28px",
          borderRadius: 6,
          "& svg": {
            fontSize: "16px"
          }
        }
      }
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      padding: "6px 8px",
      
      // Mobile: compact inline previews for single row
      [theme.breakpoints.down("sm")]: {
        flexWrap: "nowrap",
        overflowX: "auto",
        padding: "0",
        margin: "0",
        gap: "2px",
        maxWidth: "40px", // Very limited space for single row
        height: "28px", // Match input height
        flexShrink: 0,
        alignItems: "center",
        
        "&::-webkit-scrollbar": {
          display: "none"
        },
        scrollbarWidth: "none"
      }
    },

    ".file-preview": {
      position: "relative",
      maxWidth: "24px",
      maxHeight: "24px",
      flexShrink: 0,
      
      // Mobile: tiny previews for single row
      [theme.breakpoints.down("sm")]: {
        maxWidth: "14px",
        maxHeight: "14px",
        minWidth: "14px",
        minHeight: "14px"
      },

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
