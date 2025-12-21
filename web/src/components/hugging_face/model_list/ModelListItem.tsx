/** @jsxImportSource @emotion/react */

import React, { useMemo, useState, memo, useCallback } from "react";
import { Typography, Tooltip, Chip, Box, Link, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { ModelComponentProps } from "../ModelUtils";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../DownloadProgress";
import modelListItemStyles from "./ModelListItem.styles";
import { ModelListItemActions } from "./ModelListItemActions";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../../config/constants";
import { formatBytes } from "../../../utils/modelFormatting";
import { getModelUrl } from "../../../utils/providerDisplay";
import type { ModelCompatibilityResult } from "./useModelCompatibility";
import ModelCompatibilityDialog from "./ModelCompatibilityDialog";

const ModelListItem: React.FC<
  ModelComponentProps & {
    showModelStats?: boolean;
    showFileExplorerButton?: boolean;
    compatibility?: ModelCompatibilityResult;
  }
> = ({
  model,
  onDownload,
  handleModelDelete,
  handleShowInExplorer,
  compactView = false,
  showModelStats = true,
  showFileExplorerButton = true,
  compatibility
}) => {
  const downloads = useModelDownloadStore((state) => state.downloads);
  const downloadId = useMemo(() => {
    const baseId = model.repo_id || model.id;
    return model.path ? `${baseId}/${model.path}` : baseId;
  }, [model.id, model.path, model.repo_id]);
  const theme = useTheme();
  const importantTags = ["gguf", "mlx"];
  const tags = (model.tags || []).filter((tag) => importantTags.includes(tag));
  const [dialogOpen, setDialogOpen] = useState(false);
  const compatibilityCounts = useMemo(() => {
    if (!compatibility) {return { total: 0 };}
    return {
      total: compatibility.recommended.length + compatibility.compatible.length
    };
  }, [compatibility]);
  
  const handleDialogOpen = useCallback(() => {
    setDialogOpen(true);
  }, []);
  
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  // Only show download progress for active downloads (not completed, cancelled, or error)
  const download = downloadId ? downloads[downloadId] : undefined;
  const isActiveDownload = download && 
    download.status !== "completed" && 
    download.status !== "cancelled" && 
    download.status !== "error";

  if (isActiveDownload) {
    return (
      <Box
        css={modelListItemStyles(theme)}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <div className="model-content">
          <DownloadProgress name={downloadId} />
        </div>
      </Box>
    );
  }
  return (
    <Box
      css={modelListItemStyles(theme)}
      className={`model-list-item ${compactView ? "compact " : ""} ${
        model.downloaded ? "downloaded" : ""
      }`}
    >
      <div className="model-content">
        <div className="model-top-row">
          <div className="model-info-container">
            <div className="model-header">
              {(() => {
                const full = model.repo_id || model.id;
                const lastSlash = (full || "").lastIndexOf("/");
                const owner = lastSlash !== -1 ? full?.slice(0, lastSlash) : "";
                const repo =
                  lastSlash !== -1 ? full?.slice(lastSlash + 1) : full;
                const modelUrl = getModelUrl(
                  (model as any).provider,
                  model.id,
                  model.type || undefined
                );

                const content = (
                  <>
                    {owner ? (
                      <Typography component="div" className="model-owner">
                        {owner}
                      </Typography>
                    ) : null}
                    {model.path ? (
                      <>
                        <Typography component="span" className="model-name">
                          {model.path}
                        </Typography>
                        <Typography component="span" className="model-path">
                          {repo}
                        </Typography>
                      </>
                    ) : (
                      <Typography component="span" className="model-name">
                        {repo}
                      </Typography>
                    )}
                  </>
                );

                if (!modelUrl) {
                  return (
                    <div className="model-name-link no-link" title={full}>
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    href={modelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="model-name-link"
                    title={full}
                  >
                    {content}
                  </Link>
                );
              })()}
            </div>

            <div className="model-details">
              <Tooltip title="Runs locally on your device">
                <Chip
                  label="Local"
                  size="small"
                  component="span"
                  sx={{
                    height: 20,
                    fontSize: theme.vars.fontSizeTiny,
                    color: theme.vars.palette.c_provider_local,
                    borderColor: theme.vars.palette.c_provider_local,
                    background: "transparent",
                    borderWidth: 1,
                    borderStyle: "solid",
                    cursor: "help"
                  }}
                />
              </Tooltip>
              {tags.map((tag) => (
                <Chip
                  label={tag}
                  key={tag}
                  size="small"
                  component="span"
                  sx={{
                    height: 20,
                    fontSize: theme.vars.fontSizeTiny,
                    color: theme.vars.palette.grey[50],
                    borderColor: "currentColor",
                    background: "transparent",
                    borderWidth: 1,
                    borderStyle: "solid"
                  }}
                />
              ))}
              {model.pipeline_tag && (
                <Tooltip
                  title="View trending models with this tag on HuggingFace"
                  enterDelay={TOOLTIP_ENTER_DELAY * 2}
                  enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
                >
                  <Link
                    href={`https://huggingface.co/models?pipeline_tag=${model.pipeline_tag}&sort=trending`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pipeline-tag-link"
                  >
                    <Chip
                      label={model.pipeline_tag}
                      size="small"
                      className="pipeline-tag"
                      component="span"
                    />
                  </Link>
                </Tooltip>
              )}
              {compatibility && compatibilityCounts.total > 0 && (
                <Chip
                  label={`Works with ${compatibilityCounts.total} node${compatibilityCounts.total > 1 ? "s" : ""}`}
                  size="small"
                  onClick={() => setDialogOpen(true)}
                  icon={<VisibilityIcon style={{ fontSize: "1rem" }} />}
                  sx={{
                    height: 20,
                    fontSize: theme.vars.fontSizeTiny,
                    borderColor: theme.vars.palette.primary.main,
                    color: theme.vars.palette.primary.main,
                    background: "rgba(var(--palette-primary-main-channel) / 0.1)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    cursor: "pointer",
                    "&:hover": {
                      background: "rgba(var(--palette-primary-main-channel) / 0.2)"
                    },
                    "& .MuiChip-icon": {
                      color: "inherit",
                      marginLeft: "4px"
                    }
                  }}
                />
              )}
            </div>
          </div>

          <div className="actions-container" style={{ gap: "1em" }}>
            <Typography component="span" className="model-size">
              {formatBytes(model.size_on_disk || 0)}
            </Typography>
            <ModelListItemActions
              model={model}
              onDownload={onDownload}
              handleModelDelete={handleModelDelete}
              handleShowInExplorer={handleShowInExplorer}
              showFileExplorerButton={showFileExplorerButton}
            />
          </div>
        </div>

        <div className="model-details">
          {model.type?.startsWith("hf.") && showModelStats && (
            <div className="model-stats">
              <div className="model-stats-item">
                <Tooltip title="Downloads on HF last month">
                  <CloudDownloadIcon fontSize="small" />
                </Tooltip>
                <Typography component="span" variant="body2">
                  {model.downloads?.toLocaleString() || "N/A"}
                </Typography>
              </div>
              <div className="model-stats-item">
                <Tooltip title="Likes on HF">
                  <FavoriteIcon fontSize="small" />
                </Tooltip>
                <Typography component="span" variant="body2">
                  {model.likes?.toLocaleString() || "N/A"}
                </Typography>
              </div>
            </div>
          )}
          {model.description && (
            <div className="model-description-container">
              <Typography component="span" className="model-description">
                {model.description}
              </Typography>
            </div>
          )}
        </div>
      </div>
      {compatibility && (
        <ModelCompatibilityDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          model={model}
          compatibility={compatibility}
        />
      )}
    </Box>
  );
};

export default memo(ModelListItem);
