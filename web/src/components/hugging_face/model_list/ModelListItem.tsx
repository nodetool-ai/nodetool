/** @jsxImportSource @emotion/react */

import React from "react";
import {
  Typography,
  Tooltip,
  CircularProgress,
  Chip,
  Box,
  Link
} from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { ModelComponentProps } from "../ModelUtils";
import { useModelInfo } from "../../../hooks/useModelInfo";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../DownloadProgress";
import modelListItemStyles from "./ModelListItem.styles";
import { getShortModelName } from "../../../utils/modelFormatting";
import { ModelListItemActions } from "./ModelListItemActions";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../../config/constants";

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
  const downloaded = model.downloaded ?? !!model.path;

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
              <Tooltip title="No matching repository found.">
                <WarningAmberIcon
                  sx={{ color: "warning.main" }}
                  component="span"
                />
              </Tooltip>
            </div>
          </div>
          <ModelListItemActions model={model} />
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
            <Link
              href={`https://huggingface.co/${model.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="model-name-link"
            >
              <Typography component="span" className="model-name">
                {getShortModelName(model.id)}
              </Typography>
            </Link>
          </div>

          <div className="model-details">
            {modelData?.cardData?.pipeline_tag && (
              <Tooltip
                title="View trending models with this tag on HuggingFace"
                enterDelay={TOOLTIP_ENTER_DELAY * 2}
                enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
              >
                <Link
                  href={`https://huggingface.co/models?pipeline_tag=${modelData.cardData.pipeline_tag}&sort=trending`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pipeline-tag-link"
                >
                  <Chip
                    label={modelData.cardData.pipeline_tag}
                    size="small"
                    className="pipeline-tag"
                    component="span"
                  />
                </Link>
              </Tooltip>
            )}
          </div>
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
        <div className="actions-container" style={{ gap: "1em" }}>
          <Typography component="span" className="model-size">
            {formattedSize}
          </Typography>
          <ModelListItemActions
            model={model}
            onDownload={onDownload}
            handleModelDelete={handleModelDelete}
            handleShowInExplorer={handleShowInExplorer}
            ollamaBasePath={ollamaBasePath}
            showFileExplorerButton={showFileExplorerButton}
          />
        </div>
      </div>
    </Box>
  );
};

export default ModelListItem;
