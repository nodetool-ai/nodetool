import React, { useState, useCallback, memo } from "react";
import { Button, Tooltip } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import RecommendedModelsDialog from "../hugging_face/RecommendedModelsDialog";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { isEqual } from "lodash";
import { IconForType } from "../../config/data_types";

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
              fontSize: ThemeNodetool.fontSizeSmall,
              color: ThemeNodetool.palette.c_gray5,
              margin: ".25em 0",
              padding: ".25em",
              border: `1px solid ${ThemeNodetool.palette.c_gray2}`,
              lineHeight: "1.1em",
              borderRadius: ".5em",
              "&:hover": {
                cursor: "pointer",
                backgroundColor: ThemeNodetool.palette.c_gray2
              }
            }}
            onClick={handleOpenModelDialog}
          >
            <IconForType
              iconName={"model"}
              showTooltip={false}
              containerStyle={{
                margin: "-.2em 0 0 0",
                padding: "0 0.4em 0 0"
              }}
              bgStyle={{
                backgroundColor: "transparent"
              }}
              svgProps={{
                width: "1em",
                height: "1em"
              }}
            />
            Models
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
