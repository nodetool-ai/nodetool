import React from "react";
import { Box, List, Typography } from "@mui/material";
import {
  FixedSizeList as VirtualList,
  ListChildComponentProps
} from "react-window";
import ModelListItem from "./ModelListItem";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { useModels } from "./useModels";

interface ModelDisplayProps {
  models: UnifiedModel[];
  handleDeleteClick: (modelId: string) => void;
}

const ModelDisplay: React.FC<ModelDisplayProps> = ({
  models,
  handleDeleteClick
}) => {
  const { modelSearchTerm } = useModelManagerStore();
  const { handleShowInExplorer } = useModels();
  const downloadStore = useModelDownloadStore();

  // react-window configuration
  const ITEM_SIZE = 130; // px per row; adjust if list item height changes
  const MAX_LIST_HEIGHT = 600; // max viewport height
  const LIST_HEIGHT = Math.min(models.length * ITEM_SIZE, MAX_LIST_HEIGHT);

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

  return (
    <Box sx={{ width: "100%" }}>
      <VirtualList
        height={LIST_HEIGHT}
        width={"100%"}
        itemCount={models.length}
        itemSize={ITEM_SIZE}
        outerElementType={List as unknown as React.ComponentType<unknown>}
        itemKey={(index) => `${models[index].id}-${index}`}
      >
        {({ index, style }: ListChildComponentProps) => {
          const model = models[index];
          return (
            <Box style={style} sx={{ px: 0 }}>
              <ModelListItem
                model={model}
                handleModelDelete={
                  model.downloaded ? handleDeleteClick : undefined
                }
                onDownload={
                  !model.downloaded ? () => startDownload(model) : undefined
                }
                handleShowInExplorer={
                  model.downloaded ? handleShowInExplorer : undefined
                }
                showModelStats={true}
              />
            </Box>
          );
        }}
      </VirtualList>
    </Box>
  );
};

export default React.memo(ModelDisplay);
