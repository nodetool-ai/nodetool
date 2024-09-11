import React from "react";
import { Box, Button, Tooltip } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import RecommendedModelsDialog from "../hugging_face/RecommendedModelsDialog";
import { TOOLTIP_ENTER_DELAY } from "./BaseNode";
import { UnifiedModel } from "../../stores/ApiTypes";

interface ModelRecommendationsProps {
  recommendedModels: UnifiedModel[];
  hasRelevantInstalledModels: boolean;
  openModelDialog: boolean;
  handleOpenModelDialog: () => void;
  handleCloseModelDialog: () => void;
  startDownload: (
    model: string,
    modelType: string,
    allowPatterns?: string[] | null,
    ignorePatterns?: string[] | null
  ) => void;
  openDialog: () => void;
}

const ModelRecommendations: React.FC<ModelRecommendationsProps> = ({
  recommendedModels,
  hasRelevantInstalledModels,
  openModelDialog,
  handleOpenModelDialog,
  handleCloseModelDialog,
  startDownload,
  openDialog
}) => {
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
          variant="text"
          className="model-button"
          size="small"
          sx={{
            fontSize: ThemeNodetool.fontSizeTiny,
            color: hasRelevantInstalledModels
              ? ThemeNodetool.palette.c_gray5
              : ThemeNodetool.palette.c_warning,
            margin: "0",
            lineHeight: "1em",
            borderRadius: "0"
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
        openDialog={openDialog}
      />
    </>
  );
};

export default ModelRecommendations;
