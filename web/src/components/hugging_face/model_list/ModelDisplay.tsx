import React from "react";
import { Box, CircularProgress, List, Typography } from "@mui/material";
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
  const { modelSource, modelSearchTerm } = useModelManagerStore();
  const { handleShowInExplorer, ollamaBasePath } = useModels();
  const downloadStore = useModelDownloadStore();

  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = React.useState<number>(PAGE_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const visibleModels = React.useMemo(
    () => models.slice(0, Math.min(visibleCount, models.length)),
    [models, visibleCount]
  );

  const hasMore = visibleModels.length < models.length;

  const loadMore = React.useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, models.length));
  }, [hasMore, models.length]);

  // Reset pagination when the models set changes
  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [models]);

  // IntersectionObserver to trigger loading more when sentinel enters view
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(node);
    return () => observer.unobserve(node);
  }, [loadMore, visibleModels.length]);

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
    <>
      <List>
        {visibleModels.map((model: UnifiedModel, idx: number) => (
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
      <Box
        ref={sentinelRef}
        sx={{
          display: hasMore ? "flex" : "none",
          justifyContent: "center",
          py: 2
        }}
      >
        <CircularProgress size={20} />
      </Box>
    </>
  );
};

export default React.memo(ModelDisplay);
