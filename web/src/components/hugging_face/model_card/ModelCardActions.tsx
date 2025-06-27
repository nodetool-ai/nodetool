/** @jsxImportSource @emotion/react */
import React from "react";
import { CardActions, Box, Typography, Tooltip, Button } from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import DeleteButton from "../../buttons/DeleteButton";
import { Check } from "@mui/icons-material";
import { isProduction } from "../../../stores/ApiClient";
import DownloadIcon from "@mui/icons-material/Download";
import ThemeNodetool from "../../themes/ThemeNodetool";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelInfo } from "../../../hooks/useModelInfo";
import {
  HuggingFaceLink,
  ModelShowInExplorerButton,
  OllamaLink
} from "../ModelActionsCommon";

const ModelDownloadButton: React.FC<{ onClick: () => void }> = ({
  onClick
}) => (
  <Button
    className="model-download-button"
    onClick={onClick}
    variant="outlined"
  >
    <DownloadIcon sx={{ marginRight: "0.5em", fontSize: "1.25em" }} />
    Download
  </Button>
);

const ModelActions: React.FC<{
  model: UnifiedModel;
  downloaded: boolean;
  onDownload?: () => void;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  showFileExplorerButton?: boolean;
}> = (props) => {
  const {
    model,
    handleModelDelete,
    handleShowInExplorer,
    onDownload,
    downloaded,
    showFileExplorerButton = true
  } = props;

  return (
    <Box className="model-actions" sx={{ width: "100%" }}>
      {onDownload && !downloaded && (
        <ModelDownloadButton onClick={onDownload} />
      )}
      {downloaded && (
        <Tooltip title="Downloaded">
          <Check className="model-downloaded-icon" />
        </Tooltip>
      )}
      <Box sx={{ position: "absolute", bottom: "0.5em", left: "0.5em" }}>
        {handleShowInExplorer && showFileExplorerButton && (
          <ModelShowInExplorerButton
            onClick={() => handleShowInExplorer!(model.id)}
            disabled={!model.path}
          />
        )}
      </Box>

      {handleModelDelete && !isProduction && (
        <DeleteButton
          onClick={() => handleModelDelete(model.id)}
          className="delete-button"
        />
      )}
    </Box>
  );
};

interface ModelCardActionsProps {
  model: UnifiedModel;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  onDownload?: () => void;
  ollamaBasePath?: string | null;
}

const ModelCardActions: React.FC<ModelCardActionsProps> = ({
  model,
  handleModelDelete,
  handleShowInExplorer,
  onDownload,
  ollamaBasePath
}) => {
  const { modelData, isHuggingFace, isOllama } = useModelInfo(model);
  const downloaded = model.downloaded ?? !!model.path;

  const showFileExplorerButtonFinal =
    model.type === "llama_model" ? !model.path && !ollamaBasePath : !model.path;

  return (
    <Box>
      <ModelActions
        model={model}
        handleModelDelete={handleModelDelete}
        onDownload={onDownload}
        handleShowInExplorer={handleShowInExplorer}
        showFileExplorerButton={!showFileExplorerButtonFinal}
        downloaded={downloaded}
      />
      <CardActions
        className="card-actions"
        sx={{ justifyContent: "space-between", p: 2 }}
      >
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
              <Typography variant="body2" component="span">
                {modelData?.downloads?.toLocaleString() || "N/A"}
              </Typography>

              <Tooltip title="Likes on HF">
                <FavoriteIcon
                  fontSize="small"
                  sx={{ ml: 2, color: ThemeNodetool.palette.c_gray3 }}
                />
              </Tooltip>
              {modelData?.likes?.toLocaleString() || "N/A"}
            </Typography>
          </Box>
        )}
        {isHuggingFace && (
          <HuggingFaceLink modelId={model.repo_id || model.id} />
        )}
        {isOllama && <OllamaLink modelId={model.id} />}
      </CardActions>
    </Box>
  );
};

export default React.memo(ModelCardActions);
export { ModelActions };
