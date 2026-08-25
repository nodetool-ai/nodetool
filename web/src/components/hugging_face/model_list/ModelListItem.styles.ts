import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  MOTION,
  BORDER_RADIUS,
  SPACING_PX,
  getSpacingPx,
  SPACING
} from "../../ui_primitives";

const modelListItemStyles = (theme: Theme) =>
  css({
    "&.model-list-item": {
      padding: `${SPACING_PX.lg}px ${SPACING_PX.xl}px`,
      marginBottom: `${SPACING_PX.md}px`,
      boxSizing: "border-box",
      wordBreak: "break-word",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: theme.vars.palette.c_overlay_subtle,
      transition: `${MOTION.background}, ${MOTION.border}`,

      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: "rgba(var(--palette-primary-main-channel) / 0.35)"
      },

      "&.selectable": {
        cursor: "pointer"
      },
      "&.selectable:hover": {
        backgroundColor: "rgba(var(--palette-primary-main-channel) / 0.06)",
        borderColor: "rgba(var(--palette-primary-main-channel) / 0.55)"
      },
      "&.selectable.downloaded": {
        borderColor: "rgba(var(--palette-success-main-channel) / 0.3)"
      },
      "&.selectable.downloaded:hover": {
        backgroundColor: "rgba(var(--palette-success-main-channel) / 0.06)",
        borderColor: "rgba(var(--palette-success-main-channel) / 0.6)"
      },

      "&.compact": {
        padding: `${SPACING_PX.md}px ${SPACING_PX.lg}px`,

        "& .model-top-row": {
          gap: `${SPACING_PX.md}px`
        },
        "& .model-name": {
          WebkitLineClamp: 1,
          fontSize: "var(--fontSizeNormal)",
          wordBreak: "normal",
          overflowWrap: "anywhere"
        },
        "& .model-owner": {
          fontSize: "var(--fontSizeSmall)"
        },
        "& .actions-container": {
          minWidth: 0,
          gap: `${SPACING_PX.md}px`
        },
        "& .model-size": {
          minWidth: 0,
          fontSize: "var(--fontSizeSmaller)"
        },
        "& .model-info-container > .model-details": {
          display: "none"
        }
      },

      "& .model-content": {
        display: "flex",
        flexDirection: "column",
        gap: `${SPACING_PX.md}px`,
        width: "100%"
      },

      "& .model-top-row": {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: `${SPACING_PX.xl}px`,
        width: "100%"
      },

      "& .model-info-container": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: `${SPACING_PX.sm}px`,
        minWidth: 0 // Prevents flex item from overflowing
      },

      "& .model-header": {
        width: "100%",
        cursor: "default"
      },

      "& .model-description": {
        lineHeight: 1.4,
        color: theme.vars.palette.text.secondary,
        wordBreak: "break-word",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden"
      },

      "& .model-name-link": {
        color: theme.vars.palette.primary.light,
        display: "block",
        textDecoration: "none",
        transition: `color ${MOTION.normal}`,
        "&:hover": {
          color: theme.vars.palette.primary.main,
          textDecoration: "none"
        },
        "&.no-link": {
          color: theme.vars.palette.text.primary,
          cursor: "default",
          "&:hover": { textDecoration: "none" }
        }
      },

      "& .model-owner": {
        color: theme.vars.palette.text.secondary,
        fontSize: "var(--fontSizeSmall)",
        fontWeight: 500,
        lineHeight: 1.3
      },

      "& .model-name": {
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        fontSize: "var(--fontSizeBig)",
        fontWeight: 600,
        lineHeight: 1.3,
        wordBreak: "break-word",
        letterSpacing: "-0.01em"
      },
      "& .model-path": {
        display: "block",
        color: theme.vars.palette.text.secondary,
        fontSize: "var(--fontSizeSmall)"
      },
      "& .model-details": {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: `${SPACING_PX.xs}px`,
        maxWidth: "100%"
      },

      "& .model-size": {
        color: theme.vars.palette.text.secondary,
        fontSize: "var(--fontSizeSmall)",
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
        whiteSpace: "nowrap"
      },

      "& .pipeline-tag-link": {
        textDecoration: "none"
      },

      "& .actions-container": {
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: `${SPACING_PX.md}px`,
        flexShrink: 0
      },

      "& .model-actions": {
        display: "flex",
        alignItems: "center",
        "& button": {
          color: theme.vars.palette.text.secondary,
          margin: 0,
          padding: `0 ${getSpacingPx(SPACING.md)}`
        }
      },

      "& .show-in-explorer-button": {
        color: theme.vars.palette.c_folder,
        "&:hover": {
          backgroundColor: "transparent",
          color: "var(--c_file)"
        }
      },
      "& .model-external-link-icon": {
        boxShadow: "none",
        cursor: "pointer",
        padding: getSpacingPx(SPACING.md),
        backgroundColor: "transparent",
        filter: "saturate(0)",
        transition: `${MOTION.transform}, filter ${MOTION.normal}`,
        "&:hover": {
          backgroundColor: "transparent",
          transform: "scale(1.25)",
          filter: "saturate(1)"
        }
      }
    }
  });

export default modelListItemStyles;
