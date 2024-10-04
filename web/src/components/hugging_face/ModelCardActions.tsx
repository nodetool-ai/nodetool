import React from "react";
import { CardActions, Box, Typography, Tooltip } from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ThemeNodetool from "../themes/ThemeNodetool";
import { HuggingFaceLink, OllamaLink, renderModelActions } from "./ModelUtils";
import { UnifiedModel } from "../../stores/ApiTypes";

interface ModelCardActionsProps {
  model: UnifiedModel;
  modelData: any;
  isHuggingFace: boolean;
  isOllama: boolean;
  handleDelete?: (repoId: string) => void;
  onDownload?: () => void;
  downloaded: boolean;
}

const ModelCardActions: React.FC<ModelCardActionsProps> = ({
  model,
  modelData,
  isHuggingFace,
  isOllama,
  handleDelete,
  onDownload,
  downloaded
}) => {
  return (
    <>
      {renderModelActions({ model, handleDelete, onDownload }, downloaded)}
      <CardActions sx={{ justifyContent: "space-between", p: 2 }}>
        {isHuggingFace && (
          <Box className="model-stats">
            <Typography
              variant="body2"
              color="text.secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5
              }}
            >
              <Tooltip title="Downloads on HF last month">
                <CloudDownloadIcon
                  fontSize="small"
                  sx={{
                    color: ThemeNodetool.palette.c_gray3,
                    marginRight: ".1em"
                  }}
                />
              </Tooltip>
              <Typography variant="body2">
                {modelData?.downloads?.toLocaleString() || "N/A"}
              </Typography>
              <FavoriteIcon
                fontSize="small"
                sx={{ ml: 2, color: ThemeNodetool.palette.c_gray3 }}
              />{" "}
              {modelData?.likes?.toLocaleString() || "N/A"}
            </Typography>
          </Box>
        )}
        {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
        {isOllama && <OllamaLink modelId={model.id} />}
      </CardActions>
    </>
  );
};

export default React.memo(ModelCardActions);
