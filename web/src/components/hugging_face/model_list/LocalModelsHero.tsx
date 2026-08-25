import React, { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import ComputerIcon from "@mui/icons-material/Computer";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { formatBytes } from "../../../utils/modelFormatting";
import { ModelStat } from "../ModelStat";

const DOCS_URL = "https://docs.nodetool.ai/models-and-providers";

interface LocalModelsHeroProps {
  models: UnifiedModel[];
}

/** What this machine currently holds: how many models, and how much disk. */
const LocalModelsHero: React.FC<LocalModelsHeroProps> = ({ models }) => {
  const theme = useTheme();

  const stats = useMemo(() => {
    const installed = models.filter((m) => m.downloaded);
    return {
      count: installed.length,
      size: formatBytes(
        installed.reduce((sum, m) => sum + (m.size_on_disk || 0), 0)
      )
    };
  }, [models]);

  return (
    <Card
      variant="outlined"
      padding="comfortable"
      sx={{
        borderRadius: BORDER_RADIUS.lg,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <FlexColumn gap={SPACING.md}>
        <FlexRow align="center" gap={SPACING.md} sx={{ minWidth: 0 }}>
          <FlexRow
            align="center"
            justify="center"
            sx={{
              width: 36,
              height: 36,
              minWidth: 36,
              borderRadius: BORDER_RADIUS.md,
              backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
              color: theme.vars.palette.primary.main
            }}
          >
            <ComputerIcon sx={{ fontSize: 20 }} />
          </FlexRow>
          <Text size="normal" weight={600}>
            Local Models
          </Text>
        </FlexRow>

        <Caption sx={{ opacity: 0.7, lineHeight: 1.5 }}>
          Run models locally for privacy, speed, and offline access.
        </Caption>

        <FlexRow gap={SPACING.xl} align="flex-start">
          <ModelStat
            value={String(stats.count)}
            label="Installed"
            icon={
              <CheckCircleOutlineIcon
                sx={{ fontSize: 14, color: theme.vars.palette.success.main }}
              />
            }
          />
          <ModelStat
            value={stats.size}
            label="On disk"
            icon={
              <StorageOutlinedIcon
                sx={{ fontSize: 14, color: theme.vars.palette.text.secondary }}
              />
            }
          />
        </FlexRow>

        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() => window.open(DOCS_URL, "_blank", "noopener,noreferrer")}
        >
          Learn more
        </EditorButton>
      </FlexColumn>
    </Card>
  );
};

export default memo(LocalModelsHero);
