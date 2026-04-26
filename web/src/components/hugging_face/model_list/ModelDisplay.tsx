import React, { useRef } from "react";
import { Box } from "@mui/material";
import { Text } from "../../ui_primitives";
import { useVirtualizer } from "@tanstack/react-virtual";
import ModelListItem from "./ModelListItem";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { useModels } from "./useModels";

interface ModelDisplayProps {
  models: UnifiedModel[];
  handleDeleteClick: (modelId: string) => void;
}

const ITEM_SIZE = 130;
const MAX_LIST_HEIGHT = 600;

const ModelDisplay: React.FC<ModelDisplayProps> = ({
  models,
  handleDeleteClick
}) => {
  const modelSearchTerm = useModelManagerStore((state) => state.modelSearchTerm);
  const { handleShowInExplorer } = useModels();
  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const openDialog = useModelDownloadStore((state) => state.openDialog);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => ITEM_SIZE,
    overscan: 5,
    getItemKey: (index) => `${models[index].id}-${index}`,
  });
  const LIST_HEIGHT = Math.min(models.length * ITEM_SIZE, MAX_LIST_HEIGHT);

  const handleStartDownload = React.useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      const path = model.path ?? null;
      const allowPatterns = path ? null : model.allow_patterns ?? null;
      const ignorePatterns = path ? null : model.ignore_patterns ?? null;
      startDownload(
        repoId,
        model.type ?? "",
        path ?? undefined,
        allowPatterns,
        ignorePatterns
      );
      openDialog();
    },
    [startDownload, openDialog]
  );

  if (models.length === 0) {
    return (
      <Text sx={{ mt: 2 }}>
        {modelSearchTerm ? `No models found for "${modelSearchTerm}"` : ""}
      </Text>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      <div
        ref={listScrollRef}
        style={{
          height: LIST_HEIGHT,
          width: "100%",
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const model = models[vi.index];
            return (
              <Box
                key={vi.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                }}
                sx={{ px: 0 }}
              >
                <ModelListItem
                  model={model}
                  handleModelDelete={
                    model.downloaded ? handleDeleteClick : undefined
                  }
                  onDownload={
                    !model.downloaded
                      ? () => handleStartDownload(model)
                      : undefined
                  }
                  handleShowInExplorer={
                    model.downloaded ? handleShowInExplorer : undefined
                  }
                  showModelStats={true}
                />
              </Box>
            );
          })}
        </div>
      </div>
    </Box>
  );
};

export default React.memo(ModelDisplay);
