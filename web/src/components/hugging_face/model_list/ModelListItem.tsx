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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { ModelComponentProps } from "../ModelUtils";
import { useModelInfo } from "../../../hooks/useModelInfo";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../DownloadProgress";
import modelListItemStyles from "./ModelListItem.styles";
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
  showModelStats = true,
  hideMissingInfo = false,
  ollamaBasePath,
  showFileExplorerButton = true
}) => {
  const {
    modelData,
    isLoading,
    isHuggingFace,
    formattedSize
    // isOllama,
    // getModelFileType
  } = useModelInfo(model);
  const downloads = useModelDownloadStore((state) => state.downloads);
  const modelId = model.id;
  const downloaded = model.downloaded ?? !!model.path;
  const theme = useTheme();
  // Provider chip (HF / Local / API) with tooltip
  const providerLabel: "HF" | "Local" | "API" = isHuggingFace
    ? "HF"
    : downloaded
    ? "Local"
    : "API";
  const providerTooltip =
    providerLabel === "HF"
      ? "Hugging Face (HF): Repository on the Hugging Face Hub."
      : providerLabel === "Local"
      ? "Local: Model file exists on your machine."
      : "API: Remote provider; runs via API without local download.";
  if (isLoading) {
    return (
      <Box
        css={modelListItemStyles(theme)}
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
        css={modelListItemStyles(theme)}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <DownloadProgress name={modelId} />
        </div>
      </Box>
    );
  }

  if (isHuggingFace && formattedSize === "" && !hideMissingInfo) {
    return (
      <Box
        css={modelListItemStyles(theme)}
        className={`model-list-item missing ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <div className="model-info-container">
            <div className="model-header">
              <Typography component="span" className="model-name">
                {model.repo_id}
              </Typography>
              {model.path && (
                <Typography component="span" className="model-path">
                  {model.path}
                </Typography>
              )}
            </div>
            <div className="model-details">
              <Tooltip title="No matching repository found.">
                <WarningAmberIcon
                  sx={{
                    color: "var(--palette-warning-main)",
                    margin: 0,
                    width: "1em"
                  }}
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
      css={modelListItemStyles(theme)}
      className={`model-list-item ${compactView ? "compact " : ""} ${
        downloaded ? "downloaded" : ""
      }`}
    >
      <div className="model-content">
        <div className="model-top-row">
          <div className="model-info-container">
            <div className="model-header">
              <Link
                href={`https://huggingface.co/${model.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="model-name-link"
              >
                <Typography component="span" className="model-name">
                  {model.repo_id}
                </Typography>
                {model.path && (
                  <Typography component="span" className="model-path">
                    {model.path}
                  </Typography>
                )}
              </Link>
            </div>

            <div className="model-details">
              <Tooltip
                title={providerTooltip}
                enterDelay={TOOLTIP_ENTER_DELAY * 2}
                enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
              >
                <span style={{ display: "inline-flex" }} tabIndex={0}>
                  <Chip
                    label={providerLabel}
                    size="small"
                    component="span"
                    title={providerTooltip}
                    sx={{
                      height: 20,
                      fontSize: theme.vars.fontSizeTiny,
                      color:
                        providerLabel === "Local"
                          ? theme.vars.palette.providerLocal
                          : providerLabel === "HF"
                          ? theme.vars.palette.providerHf
                          : theme.vars.palette.providerApi,
                      borderColor: "currentColor",
                      background: "transparent",
                      borderWidth: 1,
                      borderStyle: "solid"
                    }}
                  />
                </span>
              </Tooltip>
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

        {model.description && (
          <div className="model-description-container">
            <Typography component="span" className="model-description">
              {model.description}
            </Typography>
          </div>
        )}
      </div>
    </Box>
  );
};

export default ModelListItem;
