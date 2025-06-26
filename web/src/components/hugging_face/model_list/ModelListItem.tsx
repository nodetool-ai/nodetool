/** @jsxImportSource @emotion/react */

import React from "react";
import {
  Typography,
  Tooltip,
  CircularProgress,
  Chip,
  Box,
  Button
} from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { ModelComponentProps } from "../ModelUtils";
import ThemeNodetool from "../../themes/ThemeNodetool";
import { useModelInfo } from "../../../hooks/useModelInfo";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../DownloadProgress";
import modelListItemStyles from "./ModelListItem.styles";
import {
  ModelShowInExplorerButton,
  HuggingFaceLink,
  OllamaLink
} from "../ModelCardActions";
import { getShortModelName, formatBytes } from "../../../utils/modelFormatting";
import { Check } from "@mui/icons-material";
import DeleteButton from "../../buttons/DeleteButton";
import DownloadIcon from "@mui/icons-material/Download";

const ModelListItem: React.FC<
  ModelComponentProps & {
    showModelStats?: boolean;
    hideMissingInfo?: boolean;
    ollamaBasePath?: string | null;
    showFileExplorerButton?: boolean;
  }
> = ({
  model,
  onDownload,
  handleModelDelete,
  handleShowInExplorer,
  compactView = false,
  showModelStats = false,
  hideMissingInfo = false,
  ollamaBasePath,
  showFileExplorerButton = true
}) => {
  const {
    modelData,
    isLoading,
    isHuggingFace,
    isOllama,
    formattedSize,
    getModelFileType
  } = useModelInfo(model);
  const downloads = useModelDownloadStore((state) => state.downloads);
  const modelId = model.id;
  const downloaded = !!model.path;

  if (isLoading) {
    return (
      <Box
        css={modelListItemStyles}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <CircularProgress size={24} />
        </div>
      </Box>
    );
  }

  if (downloads[modelId]) {
    return (
      <Box
        css={modelListItemStyles}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <DownloadProgress name={modelId} />
        </div>
      </Box>
    );
  }

  if (!modelData && !isOllama) {
    return (
      <Box
        css={modelListItemStyles}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <div className="model-info-container">
            <div className="model-header">
              <Typography component="span" className="model-name">
                {getShortModelName(model.id)}
              </Typography>
            </div>
            <div className="model-details">
              <Typography component="span" className="model-status">
                <span style={{ color: ThemeNodetool.palette.c_warning }}>
                  No matching repository found.
                </span>
              </Typography>
            </div>
          </div>

          <div className="actions-container">
            <div className="model-actions">
              {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
              {isOllama && <OllamaLink modelId={model.id} />}
            </div>
          </div>
        </div>
      </Box>
    );
  }

  return (
    <Box
      css={modelListItemStyles}
      className={`model-list-item ${compactView ? "compact " : ""} ${
        downloaded ? "downloaded" : ""
      }`}
    >
      <div className="model-content">
        <div className="model-info-container">
          <div className="model-header">
            <Typography component="span" className="model-name">
              {getShortModelName(model.repo_id ? model.repo_id : model.id)}
            </Typography>
            <Typography component="span" className="model-path">
              {model.path}
            </Typography>
          </div>

          <div className="model-details">
            {modelData?.cardData?.pipeline_tag && (
              <Chip
                label={modelData.cardData.pipeline_tag}
                size="small"
                className="pipeline-tag"
                component="span"
              />
            )}
            <div className="size-and-license">
              <Typography component="span" className="model-size">
                {formattedSize}
              </Typography>
            </div>
            <Typography component="span" className="model-info">
              {getModelFileType()}
            </Typography>
          </div>
        </div>

        <div className="actions-container">
          {onDownload && !downloaded && (
            <Button
              className="model-download-button"
              onClick={onDownload}
              variant="outlined"
            >
              <DownloadIcon sx={{ marginRight: "0.5em", fontSize: "1.25em" }} />
              Download
            </Button>
          )}

          <div className="model-actions">
            {downloaded && <Check />}
            {handleShowInExplorer && showFileExplorerButton && (
              <ModelShowInExplorerButton
                onClick={() => handleShowInExplorer!(model.id)}
                disabled={isOllama ? !ollamaBasePath : !model.path}
              />
            )}
            {handleModelDelete && (
              <DeleteButton onClick={() => handleModelDelete(model.id)} />
            )}
          </div>

          {isHuggingFace && showModelStats && (
            <div className="model-stats">
              <div className="model-stats-item">
                <Tooltip title="Downloads on HF last month">
                  <CloudDownloadIcon fontSize="small" />
                </Tooltip>
                <Typography component="span" variant="body2">
                  {modelData?.downloads?.toLocaleString() || "N/A"}
                </Typography>
              </div>
              <div className="model-stats-item">
                <Tooltip title="Likes on HF">
                  <FavoriteIcon fontSize="small" />
                </Tooltip>
                <Typography component="span" variant="body2">
                  {modelData?.likes?.toLocaleString() || "N/A"}
                </Typography>
              </div>
            </div>
          )}
          <div className="model-actions">
            {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
            {isOllama && <OllamaLink modelId={model.id} />}
          </div>
        </div>
      </div>
    </Box>
  );
};

export default ModelListItem;
