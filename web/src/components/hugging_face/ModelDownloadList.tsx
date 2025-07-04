/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Grid, Box } from "@mui/material";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import { UnifiedModel } from "../../stores/ApiTypes";
import { useModelsWithSize } from "../../hooks/useModelsWithSize";
import ModelListItem from "./model_list/ModelListItem";

const styles = (theme: any) =>
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
  const { downloads } = useModelDownloadStore((state) => ({
    startDownload: state.startDownload,
    downloads: state.downloads
  }));

  const modelsWithSize = useModelsWithSize(models);

  return (
    <Box css={styles}>
      <Grid container spacing={2} className="models-grid">
        {modelsWithSize.map((model, index) => {
          const modelId = model.id;
          return (
            <Grid item xs={12} sm={12} md={12} lg={12} key={index}>
              <Box className="model-container">
                {!downloads[modelId] && (
                  <ModelListItem
                    hideMissingInfo={false}
                    key={model.id}
                    model={model}
                    showModelStats={false}
                    handleModelDelete={() => {}}
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

export default ModelDownloadList;
