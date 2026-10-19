/** @jsxImportSource @emotion/react */
import React from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { usePromptComposerContext } from "./promptComposerContext";
import { BORDER_RADIUS, getSpacingPx, SPACING } from "../../../ui_primitives";

const chipStyles = (theme: Theme, known: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "baseline",
    margin: `0 ${theme.spacing(0.5)}`,
    padding: `0 ${getSpacingPx(SPACING.sm)}`,
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
  const { t } = useTranslation();
  const theme = useTheme();
  const { knownVariables, graphVariables } = usePromptComposerContext();
  // The leading identifier (before any filter) is the variable name.
  const name = expr.split("|")[0].trim();
  const isInput = knownVariables.has(name);
  const isGraphVariable = graphVariables.has(name);
  const known = isInput || isGraphVariable;
  const title = known
    ? isGraphVariable && !isInput
      ? t("i18n-next81.promptComposer.graphVariableTitle", { name })
      : t("i18n-next81.promptComposer.variableTitle", { name })
    : t("i18n-next81.promptComposer.missingInputTitle", { name });
  return (
    <span
      css={chipStyles(theme, known)}
      className="prompt-variable-chip nodrag"
      contentEditable={false}
      title={title}
    >
      {expr}
    </span>
  );
};
