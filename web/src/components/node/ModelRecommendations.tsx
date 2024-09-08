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
      <Box sx={{ margin: "1em" }}>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title="Find models to download."
        >
          <Button
            variant="contained"
            className="model-button"
            size="small"
            sx={{
              fontSize: ThemeNodetool.fontSizeTiny,
              color: hasRelevantInstalledModels
                ? ThemeNodetool.palette.c_gray5
                : ThemeNodetool.palette.c_warning,
              margin: "0",
              padding: "0 1em",
              position: "absolute",
              zIndex: 10,
              top: "25px",
              boxShadow: "none",
              borderRadius: ".5em",
              lineHeight: "1em"
            }}
            onClick={handleOpenModelDialog}
          >
            Recommended models
          </Button>
        </Tooltip>
      </Box>

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
