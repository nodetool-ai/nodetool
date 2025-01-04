import React, { useState, useCallback, memo } from "react";
import { Button, Tooltip } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import RecommendedModelsDialog from "../hugging_face/RecommendedModelsDialog";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { isEqual } from "lodash";

interface ModelRecommendationsButtonProps {
  recommendedModels: UnifiedModel[];
}

const ModelRecommendationsButton: React.FC<ModelRecommendationsButtonProps> = ({
  recommendedModels
}) => {
  const [openModelDialog, setOpenModelDialog] = useState(false);
  const { startDownload } = useModelDownloadStore();

  const handleOpenModelDialog = useCallback(() => setOpenModelDialog(true), []);
  const handleCloseModelDialog = useCallback(
    () => setOpenModelDialog(false),
    []
  );

  if (recommendedModels.length === 0) {
    return null;
  }

  return (
    <>
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title="Find models to download."
      >
        <Button
          variant="outlined"
          className="model-button"
          sx={{
            fontSize: ThemeNodetool.fontSizeSmaller,
            color: ThemeNodetool.palette.c_gray5,
            margin: "0",
            lineHeight: "1.5em",
            borderRadius: "0",
            border: "none",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "none",
              cursor: "pointer",
              color: ThemeNodetool.palette.c_white
            }
          }}
          onClick={handleOpenModelDialog}
        >
          Recommended models
        </Button>
      </Tooltip>

      <RecommendedModelsDialog
        open={openModelDialog}
        onClose={handleCloseModelDialog}
        recommendedModels={recommendedModels}
        startDownload={startDownload}
      />
    </>
  );
};

export default memo(ModelRecommendationsButton, isEqual);
