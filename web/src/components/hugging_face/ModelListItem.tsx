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
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  ModelComponentProps,
  formatId,
  modelSize,
  renderModelSecondaryInfo,
  renderModelActions,
  HuggingFaceLink,
  OllamaLink
} from "./ModelUtils";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useModelInfo } from "./ModelUtils";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import modelListItemStyles from "./ModelListItem.styles";


const ModelListItem: React.FC<ModelComponentProps> = ({
  model,
  onDownload,
  handleDelete,
  compactView = false
}) => {
  const { modelData, isLoading, downloaded, isHuggingFace, isOllama } =
    useModelInfo(model);
  const downloads = useModelDownloadStore((state) => state.downloads);
  const modelId = model.id;

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

  if (!modelData) {
    return (
      <Box
        css={modelListItemStyles}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <div className="model-info-container">
            <div className="model-header">
              <Typography component="span" className="model-name">
                {formatId(model.id)}
              </Typography>
            </div>
            <div className="model-details">
              <Typography component="span" className="model-info">
                {isOllama ? (
                  "Model not downloaded."
                ) : (
                  <span style={{ color: ThemeNodetool.palette.c_warning }}>
                    Failed to find matching repository.
                  </span>
                )}
              </Typography>
            </div>
          </div>

          <div className="actions-container">
            <div className="model-actions">
              {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
              {isOllama && <OllamaLink modelId={model.id} />}
              {renderModelActions(
                { model, handleDelete, onDownload },
                downloaded
              )}
            </div>
          </div>
        </div>
      </Box>
    );
  }

  return (
    <Box
      css={modelListItemStyles}
      className={`model-list-item ${compactView ? "compact" : ""}`}
    >
      <div className="model-content">
        <div className="model-info-container">
          <div className="model-header">
            <Typography component="span" className="model-name">
              {model.repo_id ? model.repo_id : model.id}
            </Typography>
            {model.path && (
              <Typography component="span" className="model-path">
                {model.path}
              </Typography>
            )}
          </div>

          <div className="model-details">
            {modelData.cardData?.pipeline_tag && (
              <Chip
                label={modelData.cardData.pipeline_tag}
                size="small"
                className="pipeline-tag"
                component="span"
              />
            )}
            {model.size_on_disk && (
              <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Size on disk">
                <Typography component="span" className="model-info">
                  {modelSize(model)}
                </Typography>
              </Tooltip>
            )}

            <Typography component="span" className="model-info">
              {renderModelSecondaryInfo(modelData, isHuggingFace)}
            </Typography>
          </div>
        </div>

        <div className="actions-container">
          {isHuggingFace && (
            <div className="model-stats">
              <div className="model-stats-item">
                <Tooltip title="Downloads on HF last month">
                  <CloudDownloadIcon fontSize="small" />
                </Tooltip>
                <Typography component="span" variant="body2">
                  {modelData.downloads?.toLocaleString() || "N/A"}
                </Typography>
              </div>
              <div className="model-stats-item">
                <Tooltip title="Likes on HF">
                  <FavoriteIcon fontSize="small" />
                </Tooltip>
                <Typography component="span" variant="body2">
                  {modelData.likes?.toLocaleString() || "N/A"}
                </Typography>
              </div>
            </div>
          )}

          <div className="model-actions">
            {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
            {isOllama && <OllamaLink modelId={model.id} />}
            {renderModelActions(
              { model, handleDelete, onDownload },
              downloaded
            )}
          </div>
        </div>
      </div>
    </Box>
  );
};

export default ModelListItem;
