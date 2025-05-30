import { css } from "@emotion/react";

export const createStyles = (theme: any) =>
  css({
    "& ": {
      width: "100%",
      display: "flex"
    },
    ".compose-message": {
      height: "auto",
      width: "100%",
      backgroundColor: theme.palette.c_gray2,
      border: "1px solid",
      borderColor: theme.palette.c_gray1,
      display: "flex",
      alignItems: "center",
      borderRadius: "16px",
      marginLeft: "1em",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
      padding: "0px 6px 0px 12px",

      "&.dragging": {
        borderColor: theme.palette.c_hl1,
        backgroundColor: `${theme.palette.c_gray2}80`
      }
    },

    ".compose-message textarea": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: "transparent",
      color: theme.palette.c_white,
      resize: "none",
      overflowY: "auto",
      flex: 1,
      outline: "none",
      border: "1px solid transparent",
      borderRadius: "16px",
      padding: ".5em 1em .5em .5em",
      margin: "0",
      boxSizing: "border-box",
      transition: "border 0.2s ease-in-out",
      "&::placeholder": {
        color: theme.palette.c_gray3
      },
      "&:focus": {
        border: "1px solid" + theme.palette.c_gray3
      }
    },

    ".compose-message button": {
      position: "absolute",
      bottom: "8px",
      width: "40px",
      height: "40px",
      backgroundColor: "transparent",
      color: theme.palette.c_hl1,
      padding: "8px",
      minWidth: "unset",
      borderRadius: "50%",
      transition: "transform 0.2s ease-in-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        transform: "scale(1.1)"
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
      gap: "8px",
      padding: "8px",
      borderBottom: `1px solid ${theme.palette.c_gray3}`
    },

    ".file-preview": {
      position: "relative",
      padding: "8px",
      maxWidth: "100px",

      ".remove-button": {
        position: "absolute",
        top: 0,
        right: 0,
        padding: "2px 6px",
        background: "rgba(0, 0, 0, 0.5)",
        borderRadius: "50%",
        cursor: "pointer",
        color: "white",
        fontSize: "16px",
        lineHeight: "1",
        "&:hover": {
          background: "rgba(0, 0, 0, 0.8)"
        }
      },

      img: {
        width: "100%",
        height: "auto",
        borderRadius: "4px"
      },

      ".file-icon-wrapper": {
        background: "rgba(255, 255, 255, 0.1)",
        padding: "8px",
        borderRadius: "4px",
        textAlign: "center",

        ".file-name": {
          fontSize: "0.8em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }
      }
    }
  });