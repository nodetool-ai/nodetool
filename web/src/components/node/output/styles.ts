/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, Z_INDEX, getSpacingPx, SPACING } from "../../ui_primitives";

export const outputStyles = (theme: Theme, hasActions = true) =>
  css({
    "&": {
      position: "relative",
      backgroundColor: "transparent",
      height: hasActions ? "calc(100% - 43px)" : "100%",
      width: "100%",
      padding: getSpacingPx(SPACING.xs),
      overflow: "auto",
      fontSize: "var(--fontSizeSmall)",
      userSelect: "text",
      cursor: "text"
    },
    "&:hover .actions": {
      opacity: 1
    },
    // Touch devices have no hover; keep the output action buttons reachable.
    "@media (pointer: coarse)": {
      ".actions": { opacity: 1 }
    },
    ".content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    p: {
      margin: "0",
      padding: getSpacingPx(SPACING.xs),
      wordWrap: "break-word",
      overflowWrap: "break-word"
    },
    ul: {
      margin: "0",
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xxl)}`,
      listStyleType: "square"
    },
    li: {
      margin: "0",
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`
    },
    pre: {
      margin: "0",
      padding: getSpacingPx(SPACING.xs),
      backgroundColor: theme.vars.palette.grey[900],
      width: "100%",
      overflowX: "scroll"
    },
    code: {
      fontFamily: theme.fontFamily2
    },
    ".actions": {
      position: "absolute",
      right: "0.5em",
      top: "0.25em",
      padding: "0",
      margin: "0",
      display: "flex",
      flexDirection: "row",
      gap: getSpacingPx(SPACING.md),
      zIndex: Z_INDEX.dropdown,
      opacity: 0,
      transition: MOTION.opacity
    },
    ".actions button": {
      minWidth: "unset",
      width: "auto",
      lineHeight: "1.5em",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xs)} 0 ${getSpacingPx(SPACING.xs)}`,
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall
    }
  });
