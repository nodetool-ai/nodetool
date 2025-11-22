/** @jsxImportSource @emotion/react */

import React from "react";
import { Typography, Tooltip, Chip, Box, Link, Divider } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
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

const ModelListItem: React.FC<
  ModelComponentProps & {
    showModelStats?: boolean;
    showFileExplorerButton?: boolean;
  }
> = ({
  model,
  onDownload,
  handleModelDelete,
  handleShowInExplorer,
  compactView = false,
  showModelStats = true,
  showFileExplorerButton = true
}) => {
  const downloads = useModelDownloadStore((state) => state.downloads);
  const modelId = model.id;
  const theme = useTheme();
  const importantTags = ["gguf", "mlx"];
  const tags = (model.tags || []).filter((tag) => importantTags.includes(tag));

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
                    <div className="model-name-link" title={full}>
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
    </Box>
  );
};

export default ModelListItem;
