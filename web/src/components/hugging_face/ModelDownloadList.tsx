/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, memo } from "react";
import { Grid, Box } from "@mui/material";
import { shallow } from "zustand/shallow";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelListItem from "./model_list/ModelListItem";

const styles = (_theme: Theme) =>
  css({
    ".models-grid": {
      overflow: "auto",
      paddingRight: "1em"
    },
    ".model-container": {
      display: "flex",
      flexDirection: "column",
      gap: "1rem"
    }
  });

interface ModelDownloadListProps {
  models: UnifiedModel[];
}

const ModelDownloadList: React.FC<ModelDownloadListProps> = ({ models }) => {
  const theme = useTheme();
  const { downloads } = useModelDownloadStore(
    (state) => ({
      startDownload: state.startDownload,
      downloads: state.downloads
    }),
    shallow
  );

  // Memoize empty callback to prevent unnecessary re-renders
  const handleModelDelete = useCallback(() => {
    // No-op - model deletion not supported in this view
  }, []);

  return (
    <Box css={styles(theme)}>
      <Grid container spacing={2} className="models-grid">
        {models.map((model, index) => {
          const modelId = model.id;
          return (
            <Grid
              sx={{
                gridColumn: {
                  xs: "span 12",
                  sm: "span 12",
                  md: "span 12",
                  lg: "span 12"
                }
              }}
              key={index}
            >
              <Box className="model-container">
                {!downloads[modelId] && (
                  <ModelListItem
                    key={model.id}
                    model={model}
                    showModelStats={false}
                    handleModelDelete={handleModelDelete}
                  />
                )}
                {downloads[modelId] && <DownloadProgress name={modelId} />}
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default memo(ModelDownloadList);
