import React, { useState, memo, useCallback } from "react";
import { Tooltip, EditorButton } from "../ui_primitives";
import DownloadIcon from "@mui/icons-material/Download";
import RecommendedModelsDialog from "../hugging_face/RecommendedModelsDialog";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { UnifiedModel, ModelPack } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import isEqual from "fast-deep-equal";

interface ModelRecommendationsButtonProps {
  recommendedModels: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const ModelRecommendationsButton: React.FC<ModelRecommendationsButtonProps> = ({
  recommendedModels,
  modelPacks
}) => {
  const [openModelDialog, setOpenModelDialog] = useState(false);
  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const openDialog = useModelDownloadStore((state) => state.openDialog);

  const onStartDownload = useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      startDownload(
        repoId,
        model.type ?? "",
        model.path ?? undefined,
        model.path ? undefined : (model.allow_patterns ?? undefined),
        model.path ? undefined : (model.ignore_patterns ?? undefined)
      );
      openDialog();
    },
    [startDownload, openDialog]
  );

  const handleOpenDialog = useCallback(() => {
    setOpenModelDialog(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setOpenModelDialog(false);
  }, []);

  if (recommendedModels.length === 0 && (!modelPacks || modelPacks.length === 0)) {
    return null;
  }

  return (
    <>
      <Tooltip
        delay={TOOLTIP_ENTER_DELAY}
        title="View and download compatible models"
      >
        <div
          style={{ display: "flex", justifyContent: "center", width: "100%", paddingTop: "0.5em" }}
        >
          <EditorButton
            variant="outlined"
            size="small"
            className="model-button"
            onClick={handleOpenDialog}
            startIcon={<DownloadIcon fontSize="small" />}
            sx={(theme) => ({
              width: "90%",
              border: 0,
              "&:hover": {
                border: 0,
                backgroundColor: theme.vars.palette.grey[600]
              }
            })}
          >
            Models
          </EditorButton>
        </div>
      </Tooltip>

      <RecommendedModelsDialog
        open={openModelDialog}
        onClose={handleCloseDialog}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
        startDownload={onStartDownload}
      />
    </>
  );
};

export default memo(ModelRecommendationsButton, isEqual);
