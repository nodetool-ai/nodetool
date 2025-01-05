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
        title="View and download compatible models"
      >
        <div
          style={{ display: "flex", justifyContent: "center", width: "100%" }}
        >
          <Button
            variant="outlined"
            className="model-button"
            sx={{
              width: "90%",
              fontSize: ThemeNodetool.fontSizeSmaller,
              color: ThemeNodetool.palette.c_white,
              margin: ".5em 0",
              padding: ".5em 1em",
              border: `1px solid ${ThemeNodetool.palette.c_attention}`,
              lineHeight: "1.1em",
              borderRadius: ".5em",
              "&:hover": {
                cursor: "pointer",
                backgroundColor: ThemeNodetool.palette.c_attention
                // color: ThemeNodetool.palette.c_black
              }
            }}
            onClick={handleOpenModelDialog}
          >
            Recommended models
          </Button>
        </div>
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
