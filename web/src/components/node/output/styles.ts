/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const outputStyles = (theme: Theme, hasActions = true) =>
  css({
    "&": {
      position: "relative",
      backgroundColor: "transparent",
      height: hasActions ? "calc(100% - 43px)" : "100%",
      width: "100%",
      padding: ".25em",
      overflow: "auto",
      fontSize: "var(--fontSizeSmaller)",
      userSelect: "text",
      cursor: "text"
    },
    "&:hover .actions": {
      opacity: 1
    },
    ".content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    p: {
      margin: "0",
      padding: ".25em",
      wordWrap: "break-word",
      overflowWrap: "break-word"
    },
    ul: {
      margin: "0",
      padding: ".1em 1.75em",
      listStyleType: "square"
    },
    li: {
      margin: "0",
      padding: ".1em .25em"
    },
    pre: {
      margin: "0",
      padding: ".25em",
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
      gap: "0.5em",
      zIndex: 10,
      opacity: 0,
      transition: "opacity 0.15s ease-in-out"
    },
    ".actions button": {
      minWidth: "unset",
      width: "auto",
      lineHeight: "1.5em",
      padding: ".3em .3em 0 .3em",
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall
    }
  });
