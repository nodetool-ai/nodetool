import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, BORDER_RADIUS } from "../../ui_primitives/tokens";
import { SPACING, getSpacingPx } from "../../ui_primitives/spacing";

export const createStyles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: "44px",
    ".compose-message": {
      width: "100%",
      backgroundColor: theme.vars.palette.c_overlay_subtle,
      backdropFilter: "blur(10px)",
      border: `1px solid ${theme.vars.palette.c_overlay}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      borderRadius: BORDER_RADIUS.pill,
      boxShadow: `0 4px 12px ${theme.vars.palette.c_scrim_soft}`,
      padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,
      minHeight: "44px",
      boxSizing: "border-box",
      position: "relative",
      overflow: "hidden",
      transition: MOTION.all,

      "&:focus-within": {
        backgroundColor: theme.vars.palette.c_overlay,
        borderColor: theme.vars.palette.c_overlay_strong,
        boxShadow: `0 4px 16px ${theme.vars.palette.c_scrim_soft}`
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
      padding: `${theme.spacing(1)} ${theme.spacing(1)} 0 ${theme.spacing(1)}`,
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
      gap: theme.spacing(1),
      flexShrink: 0,
      padding: `0 ${theme.spacing(1)}`,
      "& button": {
        top: "0",
        padding: theme.spacing(1),
        position: "relative",
        borderRadius: BORDER_RADIUS.lg
      }

      // Mobile styles handled via separate CSS file
    },

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(1),
      padding: `${theme.spacing(1)} ${theme.spacing(1)}`

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
        borderRadius: BORDER_RADIUS.sm
      },

      ".file-icon-wrapper": {
        padding: theme.spacing(0.5),
        borderRadius: BORDER_RADIUS.sm,
        textAlign: "center",
        width: "48px",
        height: "48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",

        svg: {
          fontSize: "var(--fontSizeBig)"
        },

        ".file-name": {
          fontSize: "0.65em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "52px",
          marginTop: getSpacingPx(SPACING.micro)
        }
      }
    }
  });
