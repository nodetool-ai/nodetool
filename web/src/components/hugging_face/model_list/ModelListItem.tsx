/** @jsxImportSource @emotion/react */

import React, { useMemo, useState, useCallback, memo } from "react";
import { Chip, FlexRow, Tooltip, Text, Box, TextLink } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
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
    isCheckingCache?: boolean;
    onSelect?: () => void;
  }
> = ({
  model,
  onDownload,
  onSelect,
  handleModelDelete,
  handleShowInExplorer,
  compactView = false,
  showFileExplorerButton = true,
  compatibility,
  isCheckingCache = false
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

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't select when the click lands on a link or button inside the row
      // (e.g. the HuggingFace name link or an action button).
      if ((e.target as HTMLElement).closest("a, button")) {
        return;
      }
      onSelect?.();
    },
    [onSelect]
  );

  const compatibilityCounts = useMemo(() => {
    if (!compatibility) {return { total: 0 };}
    return {
      total: compatibility.recommended.length + compatibility.compatible.length
    };
  }, [compatibility]);

  if (downloadId && downloads[downloadId]) {
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
  const selectable = !!onSelect && !!model.downloaded;
  return (
    <Box
      css={modelListItemStyles(theme)}
      className={`model-list-item ${compactView ? "compact " : ""} ${
        model.downloaded ? "downloaded " : ""
      }${selectable ? "selectable" : ""}`}
      onClick={selectable ? handleRowClick : undefined}
      sx={selectable ? { cursor: "pointer" } : undefined}
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
                  model.provider ?? undefined,
                  model.id,
                  model.type || undefined
                );

                const content = (
                  <>
                    {owner ? (
                      <Text component="div" className="model-owner">
                        {owner}
                      </Text>
                    ) : null}
                    {model.path ? (
                      <>
                        <Text component="span" className="model-name">
                          {model.path}
                        </Text>
                        <Text component="span" className="model-path">
                          {repo}
                        </Text>
                      </>
                    ) : (
                      <Text component="span" className="model-name">
                        {repo}
                      </Text>
                    )}
                  </>
                );

                // When the row itself is selectable, render the name as plain
                // text so clicking it selects the model instead of navigating
                // to the repo. The HuggingFace link icon in the actions area
                // still provides access to the repo page.
                if (!modelUrl || selectable) {
                  return (
                    <div className="model-name-link no-link" title={full}>
                      {content}
                    </div>
                  );
                }

                return (
                  <TextLink
                    href={modelUrl}
                    external
                    className="model-name-link"
                    title={full}
                  >
                    {content}
                  </TextLink>
                );
              })()}
            </div>

            <div className="model-details">
              <Tooltip title="Runs locally on your device" delay={400}>
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
                  delay={TOOLTIP_ENTER_DELAY * 2}
                  nextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
                >
                  <TextLink
                    href={`https://huggingface.co/models?pipeline_tag=${model.pipeline_tag}&sort=trending`}
                    external
                    className="pipeline-tag-link"
                  >
                    <Chip
                      label={model.pipeline_tag}
                      size="small"
                      className="pipeline-tag"
                      component="span"
                    />
                  </TextLink>
                </Tooltip>
              )}
              {compatibility && compatibilityCounts.total > 0 && (
                <Chip
                  label={`Works with ${compatibilityCounts.total} node${compatibilityCounts.total > 1 ? "s" : ""}`}
                  size="small"
                  onClick={handleOpenDialog}
                  icon={<VisibilityIcon style={{ fontSize: "var(--fontSizeNormal)" }} />}
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

          <FlexRow
            className="actions-container"
            justify="flex-end"
            align="center"
            gap={1}
          >
            {model.size_on_disk ? (
              <Text component="span" className="model-size">
                {formatBytes(model.size_on_disk)}
              </Text>
            ) : null}
            <ModelListItemActions
              model={model}
              onDownload={onDownload}
              onSelect={onSelect}
              handleModelDelete={handleModelDelete}
              handleShowInExplorer={handleShowInExplorer}
              showFileExplorerButton={showFileExplorerButton}
              isCheckingCache={isCheckingCache}
            />
          </FlexRow>
        </div>

        <div className="model-details">
          {model.description && (
            <div className="model-description-container">
              <Text component="span" className="model-description">
                {model.description}
              </Text>
            </div>
          )}
        </div>
      </div>
      {compatibility && (
        <ModelCompatibilityDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          model={model}
          compatibility={compatibility}
        />
      )}
    </Box>
  );
};

export default memo(ModelListItem);
