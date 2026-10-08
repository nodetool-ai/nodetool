/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import Check from "@mui/icons-material/Check";
import DownloadIcon from "@mui/icons-material/Download";
import {
  Box,
  FlexRow,
  Text,
  Tooltip,
  EditorButton,
  LoadingSpinner, BORDER_RADIUS, activateOnKey } from "../../ui_primitives";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../../hugging_face/DownloadProgress";
import { formatBytes } from "../../../utils/modelFormatting";

interface RecommendedDownloadRowProps {
  model: UnifiedModel;
  downloaded: boolean;
  checking: boolean;
  onSelect: () => void;
  onDownload: () => void;
  /** Human-readable download destination, shown on the Download button. */
  targetLabel?: string;
  style?: React.CSSProperties;
}

/**
 * Compact recommended-download row for the model picker. A not-yet-downloaded
 * model offers an inline Download; an in-progress one shows live progress; a
 * finished one becomes selectable in place (click row / "Use") — so acquiring
 * and selecting a model are the same flow at different states.
 */
const RecommendedDownloadRow: React.FC<RecommendedDownloadRowProps> = ({
  model,
  downloaded,
  checking,
  onSelect,
  onDownload,
  targetLabel,
  style
}) => {
  const theme = useTheme();

  const downloadId = useMemo(() => {
    const baseId = model.repo_id || model.id;
    return model.path ? `${baseId}/${model.path}` : baseId;
  }, [model.id, model.path, model.repo_id]);

  // A curated entry carries a readable name ("base.en"). A Hub entry's name is
  // its repository id, so the file or repository name reads better.
  const { title, source } = useMemo(() => {
    const repoId = model.repo_id || model.id || "";
    const repo = repoId.slice(repoId.lastIndexOf("/") + 1);
    const hasOwnName =
      Boolean(model.name) && model.name !== repoId && model.name !== model.id;
    return {
      title: hasOwnName ? model.name : model.path || repo,
      source: repoId
    };
  }, [model.id, model.name, model.path, model.repo_id]);

  // Select the flag, not the `downloads` map: the map is replaced on every
  // progress message, which would re-render every row in the list.
  const isDownloading = useModelDownloadStore((s) =>
    Boolean(s.downloads[downloadId])
  );

  const handleDownloadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload();
    },
    [onDownload]
  );

  return (
    <div style={style}>
      <FlexRow
        align="center"
        gap={1.5}
        onClick={downloaded ? onSelect : undefined}
        onKeyDown={downloaded ? activateOnKey(onSelect) : undefined}
        role={downloaded ? "button" : undefined}
        tabIndex={downloaded ? 0 : undefined}
        aria-label={downloaded ? `Use ${model.id}` : undefined}
        sx={{
          px: 1.5,
          height: "100%",
          minWidth: 0,
          cursor: downloaded ? "pointer" : "default",
          borderRadius: BORDER_RADIUS.sm,
          "@media (hover: hover)": downloaded
            ? {
                "&:hover": { background: theme.vars.palette.action.hover }
              }
            : undefined
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Text
            component="div"
            sx={{
              fontSize: theme.vars.fontSizeNormal,
              fontWeight: 500,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {title}
          </Text>
          <Text
            component="div"
            sx={{
              fontSize: theme.vars.fontSizeSmaller,
              color: theme.vars.palette.text.secondary,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {model.size_on_disk
              ? `${source} · ${formatBytes(model.size_on_disk)}`
              : source}
          </Text>
        </Box>

        {isDownloading ? (
          <DownloadProgress name={downloadId} minimal />
        ) : checking && !downloaded ? (
          <FlexRow
            align="center"
            gap={0.5}
            sx={{ flexShrink: 0, color: "text.secondary" }}
          >
            <LoadingSpinner inline size={12} thickness={5} color="inherit" />
            <Text sx={{ fontSize: theme.vars.fontSizeSmall, color: "text.secondary" }}>
              Checking…
            </Text>
          </FlexRow>
        ) : downloaded ? (
          <Tooltip title="Use this model">
            <EditorButton
              variant="contained"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              startIcon={<Check sx={{ fontSize: "1.1em" }} />}
              sx={{ flexShrink: 0 }}
            >
              Use
            </EditorButton>
          </Tooltip>
        ) : (
          <Tooltip
            title={
              model.size_on_disk
                ? `Download ${formatBytes(model.size_on_disk)} to ${targetLabel ?? "this computer"}`
                : `Downloads to ${targetLabel ?? "this computer"}`
            }
          >
            <EditorButton
              variant="outlined"
              onClick={handleDownloadClick}
              startIcon={<DownloadIcon sx={{ fontSize: "1.1em" }} />}
              sx={{ flexShrink: 0 }}
            >
              Download
            </EditorButton>
          </Tooltip>
        )}
      </FlexRow>
    </div>
  );
};

export default React.memo(RecommendedDownloadRow);
