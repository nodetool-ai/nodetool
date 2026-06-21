/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { usePromptComposerContext } from "./promptComposerContext";
import { BORDER_RADIUS } from "../../../ui_primitives";

const chipStyles = (theme: Theme, known: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "baseline",
    margin: `0 ${theme.spacing(0.5)}`,
    padding: "0 0.4em",
    borderRadius: BORDER_RADIUS.sm,
    border: `1px solid ${
      known ? theme.vars.palette.success.main : theme.vars.palette.warning.main
    }`,
    backgroundColor: known
      ? `rgba(${theme.vars.palette.success.mainChannel} / 0.18)`
      : `rgba(${theme.vars.palette.warning.mainChannel} / 0.18)`,
    color: theme.vars.palette.text.primary,
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    userSelect: "none"
  });

export const VariableChip: React.FC<{ expr: string }> = ({ expr }) => {
  const theme = useTheme();
  const { knownVariables } = usePromptComposerContext();
  // The leading identifier (before any filter) is the dynamic-input name.
  const name = expr.split("|")[0].trim();
  const known = knownVariables.has(name);
  return (
    <span
      css={chipStyles(theme, known)}
      className="prompt-variable-chip nodrag"
      contentEditable={false}
      title={
        known
          ? `Variable "${name}"`
          : `"${name}" has no matching input — add it as a variable`
      }
    >
      {expr}
    </span>
  );
};
