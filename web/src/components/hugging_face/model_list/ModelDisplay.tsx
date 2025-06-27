import React from "react";
import { Grid, List, Typography } from "@mui/material";
import ModelCard from "../model_card/ModelCard";
import ModelListItem from "./ModelListItem";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { ModelSource } from "./useModels";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";

type ViewMode = "grid" | "list";

interface ModelDisplayProps {
  models: UnifiedModel[];
  viewMode: ViewMode;
  modelSource: ModelSource;
  modelSearchTerm: string;
  handleDeleteClick: (modelId: string) => void;
  handleShowInExplorer: (modelId: string) => void;
  ollamaBasePath: string | null | undefined;
}

const ModelDisplay: React.FC<ModelDisplayProps> = ({
  models,
  viewMode,
  modelSource,
  modelSearchTerm,
  handleDeleteClick,
  handleShowInExplorer,
  ollamaBasePath
}) => {
  const downloadStore = useModelDownloadStore();

  const startDownload = React.useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      downloadStore.startDownload(
        repoId,
        model.type ?? "",
        model.path ?? undefined
      );
      downloadStore.openDialog();
    },
    [downloadStore]
  );

  if (models.length === 0) {
    return (
      <Typography variant="body1" sx={{ mt: 2 }}>
        {modelSearchTerm ? `No models found for "${modelSearchTerm}"` : ""}
      </Typography>
    );
  }

  const allowDelete = modelSource === "downloaded";
  const allowDownload = modelSource === "recommended";
  const allowShowInExplorer = modelSource === "downloaded";

  return (
    <List>
      {models.map((model: UnifiedModel, idx: number) => (
        <ModelListItem
          key={`${model.id}-${idx}`}
          model={model}
          handleModelDelete={allowDelete ? handleDeleteClick : undefined}
          onDownload={allowDownload ? () => startDownload(model) : undefined}
          handleShowInExplorer={
            allowShowInExplorer ? handleShowInExplorer : undefined
          }
          // hideMissingInfo={modelSource === "recommended"}
          showModelStats={modelSource === "recommended"}
          ollamaBasePath={ollamaBasePath}
        />
      ))}
    </List>
  );
};

export default React.memo(ModelDisplay);
