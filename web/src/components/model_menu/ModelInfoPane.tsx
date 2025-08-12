/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Typography } from "@mui/material";
import type { LanguageModel } from "../../stores/ApiTypes";

const paneStyles = css(({ theme }) => ({
  overflowY: "auto",
  maxHeight: 520,
  fontSize: theme.vars.fontSizeNormal
}));

export interface ModelInfoPaneProps {
  model: LanguageModel | null;
}

const ModelInfoPane: React.FC<ModelInfoPaneProps> = ({ model }) => {
  if (!model) {
    return (
      <Box
        css={paneStyles}
        className="model-menu__info-pane is-empty"
        sx={{ color: "var(--palette-grey-300)" }}
      >
        <Typography variant="body2">Select a model to see details</Typography>
      </Box>
    );
  }
  return (
    <Box css={paneStyles} className="model-menu__info-pane">
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {model.name}
      </Typography>
      <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
        Provider: {model.provider}
      </Typography>
      {/* Placeholder for info fetched via React Query (HF card, etc.) */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" sx={{ opacity: 0.85 }}>
          Info will be loaded on click. Future: web search + LLM summary.
        </Typography>
      </Box>
    </Box>
  );
};

export default ModelInfoPane;
