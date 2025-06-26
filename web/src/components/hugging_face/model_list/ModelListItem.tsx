/** @jsxImportSource @emotion/react */

import React from "react";
import {
  Typography,
  Tooltip,
  CircularProgress,
  Chip,
  Box
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
import ModelCardActions from "../ModelCardActions";
import { getShortModelName, formatBytes } from "../../../utils/modelFormatting";
import { HuggingFaceLink, OllamaLink } from "../ModelCardActions";

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
    isError,
    formattedSize,
    isOllama
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

  if (!modelData && !hideMissingInfo) {
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
                {model.type === "llama_model" ? (
                  "Model not downloaded."
                ) : (
                  <span style={{ color: ThemeNodetool.palette.c_warning }}>
                    No matching repository found.
                  </span>
                )}
              </Typography>
            </div>
          </div>

          <div className="actions-container">
            <div className="model-actions-container">
              {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
              {isOllama && <OllamaLink modelId={model.id} />}
              <ModelCardActions
                model={model}
                modelData={modelData}
                isHuggingFace={isHuggingFace}
                isOllama={isOllama}
                handleModelDelete={handleModelDelete}
                onDownload={onDownload}
                handleShowInExplorer={handleShowInExplorer}
                showFileExplorerButton={showFileExplorerButton}
                downloaded={downloaded}
              />
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
            {model.path && (
              <Typography component="span" className="model-path">
                {model.path}
              </Typography>
            )}
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
              {formattedSize && (
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title={downloaded ? "Size on disk" : "Download size"}
                >
                  <Typography component="span" className="model-size">
                    {formattedSize}
                  </Typography>
                </Tooltip>
              )}

              <Typography component="span" className="model-info"></Typography>
            </div>
          </div>
        </div>

        <div className="actions-container">
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
            <ModelCardActions
              model={model}
              modelData={modelData}
              isHuggingFace={isHuggingFace}
              isOllama={isOllama}
              handleModelDelete={handleModelDelete}
              onDownload={onDownload}
              handleShowInExplorer={handleShowInExplorer}
              showFileExplorerButton={showFileExplorerButton}
              downloaded={downloaded}
            />
          </div>
        </div>
      </div>
    </Box>
  );
};

export default ModelListItem;
