/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  Tooltip,
  BORDER_RADIUS
} from "../../ui_primitives";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../DownloadProgress";
import {
  FIT_LABELS,
  getEngine,
  type FitLevel,
  type OnboardingModel
} from "./onboardingCatalog";
import type { UnifiedModel } from "../../../stores/ApiTypes";

interface OnboardingModelRowProps {
  entry: OnboardingModel;
  fit: FitLevel;
  downloaded: boolean;
  onDownload: (model: UnifiedModel) => void;
}

const FIT_COLOR: Record<
  FitLevel,
  "success" | "warning" | "error" | "default"
> = {
  fits: "success",
  tight: "warning",
  over: "error",
  unknown: "default"
};

const OnboardingModelRow: React.FC<OnboardingModelRowProps> = ({
  entry,
  fit,
  downloaded,
  onDownload
}) => {
  const theme = useTheme();
  const downloadId = entry.model.repo_id || entry.model.id;
  const download = useModelDownloadStore((state) => state.downloads[downloadId]);
  const engine = getEngine(entry.engine);

  const handleDownload = useCallback(() => {
    onDownload(entry.model);
  }, [onDownload, entry.model]);

  return (
    <FlexColumn
      gap={1}
      sx={{
        padding: "0.85rem 1rem",
        borderRadius: BORDER_RADIUS.md,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <FlexRow gap={2} align="flex-start" justify="space-between">
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap" }}>
            <Text size="normal" weight={600} sx={{ lineHeight: 1.2 }}>
              {entry.name}
            </Text>
            {entry.featured && (
              <Chip label="Popular" compact color="primary" variant="outlined" />
            )}
            {engine && (
              <Tooltip title={engine.description} delay={400}>
                <Chip label={engine.name} compact variant="outlined" />
              </Tooltip>
            )}
          </FlexRow>
          <Caption sx={{ opacity: 0.7, lineHeight: 1.45 }}>
            {entry.blurb}
          </Caption>
          <FlexRow gap={1} align="center" sx={{ mt: 0.25, flexWrap: "wrap" }}>
            <Caption sx={{ fontVariantNumeric: "tabular-nums" }}>
              ~{entry.approxSizeGb} GB{entry.quant ? ` · ${entry.quant}` : ""}
            </Caption>
            <Caption sx={{ opacity: 0.5 }}>·</Caption>
            <Caption sx={{ fontVariantNumeric: "tabular-nums" }}>
              ~{entry.minVramGb} GB memory
            </Caption>
          </FlexRow>
        </FlexColumn>

        <FlexColumn gap={0.75} align="flex-end" sx={{ flexShrink: 0 }}>
          <Chip
            label={FIT_LABELS[fit]}
            compact
            color={FIT_COLOR[fit]}
            variant={fit === "unknown" ? "outlined" : "filled"}
          />
          {downloaded ? (
            <FlexRow gap={0.5} align="center">
              <CheckCircleIcon
                sx={{
                  fontSize: 16,
                  color: theme.vars.palette.success.main
                }}
              />
              <Caption color="secondary">Installed</Caption>
            </FlexRow>
          ) : (
            <EditorButton
              variant={fit === "over" ? "outlined" : "contained"}
              density="compact"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
              onClick={handleDownload}
            >
              Download
            </EditorButton>
          )}
        </FlexColumn>
      </FlexRow>

      {download && (
        <Box sx={{ mt: 0.5 }}>
          <DownloadProgress name={downloadId} />
        </Box>
      )}
    </FlexColumn>
  );
};

export default memo(OnboardingModelRow);
