import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION } from "../../ui_primitives/tokens";

export const createStyles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: "44px",
    ".compose-message": {
      width: "100%",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      borderRadius: 24,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      padding: `${theme.spacing(0.75)} ${theme.spacing(1.5)}`,
      minHeight: "44px",
      boxSizing: "border-box",
      position: "relative",
      overflow: "hidden",
      transition: MOTION.all,

      "&:focus-within": {
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
      },

      "&.dragging": {
        borderColor: "var(--palette-primary-main)",
        backgroundColor: `${theme.vars.palette.grey[800]}80`
      },

      ".composer-footer": {
        display: "flex",
        alignItems: "center",
        width: "100%",
        paddingTop: "0px",
        gap: theme.spacing(1),

        ".chat-action-buttons": {
          marginLeft: "auto"
        }
      }
    },

    ".compose-message textarea": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[0],
      resize: "none",
      flex: "none",
      width: "100%",
      minWidth: 0,
      outline: "none",
      border: "0",
      borderColor: "transparent",
      padding: `${theme.spacing(0.75)} ${theme.spacing(1.25)} 0 ${theme.spacing(0.75)}`,
      margin: "0",
      boxSizing: "border-box",
      "&::placeholder": {
        color: theme.vars.palette.grey[500]
      }
    },

    ".button-container": {
      display: "flex",
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing(0.75),
      flexShrink: 0,
      padding: `0 ${theme.spacing(0.75)}`,
      "& button": {
        top: "0",
        padding: theme.spacing(0.75),
        position: "relative",
        borderRadius: 12
      }

      // Mobile styles handled via separate CSS file
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.75),
      padding: `${theme.spacing(0.75)} ${theme.spacing(1)}`

      // Mobile styles handled via separate CSS file
    },

    ".file-preview": {
      position: "relative",
      maxWidth: "48px",
      maxHeight: "48px",
      flexShrink: 0,

      // Mobile styles handled via separate CSS file

      img: {
        width: "48px",
        height: "48px",
        objectFit: "cover",
        borderRadius: "var(--rounded-sm)"
      },

      ".file-icon-wrapper": {
        padding: theme.spacing(0.5),
        borderRadius: "var(--rounded-sm)",
        textAlign: "center",
        width: "48px",
        height: "48px",
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
