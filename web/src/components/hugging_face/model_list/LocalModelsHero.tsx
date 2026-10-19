import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  SPACING,
  ICON_SIZE
} from "../../ui_primitives";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { formatBytes } from "../../../utils/modelFormatting";
import { ModelStat } from "../ModelStat";
import { isInstalledModel, isManageableModel } from "./useModels";

const DOCS_URL = "https://docs.nodetool.ai/models-and-providers";

interface LocalModelsHeroProps {
  models: UnifiedModel[];
}

/** What this machine currently holds: how many models, and how much disk. */
const LocalModelsHero: React.FC<LocalModelsHeroProps> = ({ models }) => {
  const theme = useTheme();
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const installed = models.filter(
      (m) => isManageableModel(m) && isInstalledModel(m)
    );
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
            <ComputerIcon sx={{ fontSize: ICON_SIZE.lg }} />
          </FlexRow>
          <Text size="normal" weight={600}>
            {t("i18n-next70.localModelsHero.title")}
          </Text>
        </FlexRow>

        <Caption sx={{ opacity: 0.7, lineHeight: 1.5 }}>
          {t("i18n-next70.localModelsHero.description")}
        </Caption>

        <FlexRow gap={SPACING.xl} align="flex-start">
          <ModelStat
            value={String(stats.count)}
            label={t("i18n-next70.localModelsHero.installed")}
            icon={
              <CheckCircleOutlineIcon
                sx={{ fontSize: ICON_SIZE.xs, color: theme.vars.palette.success.main }}
              />
            }
          />
          <ModelStat
            value={stats.size}
            label={t("i18n-next70.localModelsHero.onDisk")}
            icon={
              <StorageOutlinedIcon
                sx={{ fontSize: ICON_SIZE.xs, color: theme.vars.palette.text.secondary }}
              />
            }
          />
        </FlexRow>

        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<OpenInNewIcon />}
          onClick={() => window.open(DOCS_URL, "_blank", "noopener,noreferrer")}
        >
          {t("i18n-next70.localModelsHero.learnMore")}
        </EditorButton>
      </FlexColumn>
    </Card>
  );
};

export default memo(LocalModelsHero);
