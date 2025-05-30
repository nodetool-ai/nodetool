/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

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

const styles = (theme: any) =>
  css({
    "&.model-list-item": {
      padding: "0.5em 0.5em",
      marginBottom: "0",
      backgroundColor: theme.palette.c_gray1,
      boxSizing: "border-box",
      borderBottom: "1px solid " + theme.palette.c_gray2,
      transition: "border 0.125s ease-in",
      wordBreak: "break-word",

      "&.compact": {
        padding: 0,
        backgroundColor: theme.palette.c_gray0
      },

      "&:hover": {
        opacity: 0.9
      },

      "& .model-content": {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1em",
        width: "100%",
        padding: "0em 0.5em"
      },

      "& .model-info-container": {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1em",
        lineHeight: "2.5em",
        minWidth: 0 // Prevents flex item from overflowing
      },

      "& .model-header": {
        flex: 2,
        maxWidth: "400px",
        lineHeight: "1.2em"
      },

      "& .model-name": {
        fontWeight: "bold",
        textTransform: "uppercase",
        color: theme.palette.c_hl1,
        overflow: "hidden",
        textOverflow: "ellipsis"
      },

      "& .model-details": {
        flex: 1,
        gap: "0.2em",
        width: "200px",
        display: "flex",
        alignItems: "start",
        flexWrap: "wrap",
        flexDirection: "column"
      },

      "& .model-info": {
        color: theme.palette.text.secondary,
        fontSize: "0.875rem"
      },
      "& .pipeline-tag": {
        color: "var(--c_gray1)",
        fontSize: "var(--fontSizeSmall)",
        fontWeight: "bold",
        height: "1.5em",
        padding: "0"
      },

      "& .actions-container": {
        display: "flex",
        justifyContent: "space-between",
        gap: "1em",
        alignItems: "center",
        flexShrink: 0
      },

      "& .model-stats": {
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
        minWidth: "200px",
        gap: "0.5em"
      },

      "& .model-stats-item": {
        display: "flex",
        alignItems: "center",
        gap: "0.25em"
      },

      "& .model-actions": {
        display: "flex",
        gap: ".5em",
        alignItems: "center"
      },

      "& .secondary-action": {
        display: "flex",
        gap: ".1em",
        alignItems: "center",
        position: "absolute"
      },
      "&.compact .secondary-action": {
        position: "relative",
        right: "unset",
        left: "1em"
      }
    },

    ".model-external-link-icon": {
      boxShadow: "none",
      cursor: "pointer",
      backgroundColor: "transparent",
      filter: "saturate(0)",
      transition: "transform 0.125s ease-in, filter 0.2s ease-in",
      "&:hover": {
        backgroundColor: "transparent",
        transform: "scale(1.5)",
        filter: "saturate(1)"
      }
    },
    ".model-external-link-icon img": {
      cursor: "pointer"
    }
  });

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
        css={styles}
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
        css={styles}
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
        css={styles}
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
      css={styles}
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
