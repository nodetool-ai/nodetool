/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { LanguageModel } from "../../stores/ApiTypes";
import { ScrollArea } from "../ui_primitives";

const paneStyles = (theme: Theme) =>
  css({
    fontSize: theme.vars.fontSizeNormal
  });

export interface ModelInfoPaneProps {
  model: LanguageModel | null;
}

const ModelInfoPane: React.FC<ModelInfoPaneProps> = ({ model }) => {
  const theme = useTheme();

  if (!model) {
    return (
      <ScrollArea
        maxHeight={520}
        css={paneStyles(theme)}
        className="model-menu__info-pane is-empty"
        sx={{ color: "var(--palette-grey-300)" }}
      >
        <Typography variant="body2">Select a model to see details</Typography>
      </ScrollArea>
    );
  }
  return (
    <ScrollArea maxHeight={520} css={paneStyles(theme)} className="model-menu__info-pane">
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
    </ScrollArea>
  );
};

export default ModelInfoPane;
