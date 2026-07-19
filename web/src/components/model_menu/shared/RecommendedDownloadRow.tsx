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
  LoadingSpinner, BORDER_RADIUS } from "../../ui_primitives";
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
  style
}) => {
  const theme = useTheme();
  const downloads = useModelDownloadStore((s) => s.downloads);

  const downloadId = useMemo(() => {
    const baseId = model.repo_id || model.id;
    return model.path ? `${baseId}/${model.path}` : baseId;
  }, [model.id, model.path, model.repo_id]);

  const { owner, repo } = useMemo(() => {
    const full = model.repo_id || model.id || "";
    const lastSlash = full.lastIndexOf("/");
    return {
      owner: lastSlash !== -1 ? full.slice(0, lastSlash) : "",
      repo: lastSlash !== -1 ? full.slice(lastSlash + 1) : full
    };
  }, [model.id, model.repo_id]);

  const handleDownloadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload();
    },
    [onDownload]
  );

  const isDownloading = !!downloads[downloadId];

  if (isDownloading) {
    return (
      <div style={style}>
        <Box sx={{ px: 1.5, py: 0.75, height: "100%" }}>
          <DownloadProgress name={downloadId} minimal />
        </Box>
      </div>
    );
  }

  return (
    <div style={style}>
      <FlexRow
        align="center"
        gap={1.5}
        onClick={downloaded ? onSelect : undefined}
        sx={{
          px: 1.5,
          height: "100%",
          minWidth: 0,
          cursor: downloaded ? "pointer" : "default",
          borderRadius: BORDER_RADIUS.sm,
          "&:hover": downloaded
            ? { background: theme.vars.palette.action.hover }
            : undefined
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {owner ? (
            <Text
              component="div"
              sx={{
                fontSize: theme.vars.fontSizeSmaller,
                color: theme.vars.palette.text.secondary,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {owner}
            </Text>
          ) : null}
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
            {model.path || repo}
          </Text>
        </Box>

        {model.size_on_disk ? (
          <Text
            sx={{
              flexShrink: 0,
              fontSize: theme.vars.fontSizeSmall,
              color: theme.vars.palette.text.secondary
            }}
          >
            {formatBytes(model.size_on_disk)}
          </Text>
        ) : null}

        {checking && !downloaded ? (
          <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            <LoadingSpinner inline size={12} thickness={5} color="inherit" />
            <Text sx={{ fontSize: theme.vars.fontSizeSmall, color: "text.secondary" }}>
              Checking…
            </Text>
          </Box>
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
          <EditorButton
            variant="outlined"
            onClick={handleDownloadClick}
            startIcon={<DownloadIcon sx={{ fontSize: "1.1em" }} />}
            sx={{ flexShrink: 0 }}
          >
            Download
          </EditorButton>
        )}
      </FlexRow>
    </div>
  );
};

export default React.memo(RecommendedDownloadRow);
