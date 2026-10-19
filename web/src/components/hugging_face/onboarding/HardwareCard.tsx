import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import MemoryIcon from "@mui/icons-material/Memory";
import DeveloperBoardIcon from "@mui/icons-material/DeveloperBoard";
import {
  Box,
  Card,
  Caption,
  Chip,
  Tooltip,
  FlexColumn,
  FlexRow,
  SelectField,
  Text,
  BORDER_RADIUS,
  SPACING,
  ICON_SIZE
} from "../../ui_primitives";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { ModelStat } from "../ModelStat";
import type { HardwareProfile } from "./useHardwareProfile";

interface HardwareCardProps {
  profile: HardwareProfile;
  /**
   * Narrow-column layout: header, stats, and the budget select stack instead
   * of sitting on one row. Used by the model manager's info rail.
   */
  dense?: boolean;
}

const AUTO_VALUE = "auto";
const OVERRIDE_VALUES = ["4", "6", "8", "12", "16", "24", "32", "48"];

const budgetNoteKey = (profile: HardwareProfile): string => {
  switch (profile.budgetSource) {
    case "gpu":
      return "gpu";
    case "unified-memory":
      return "unifiedMemory";
    case "manual":
      return "manual";
    default:
      return "unknown";
  }
};

const gb = (value: number | null | undefined, unavailable: string): string =>
  value != null ? `${Math.round(value)} GB` : unavailable;

/** Tier labels read "Name — what it runs"; the chip shows the name only. */
const tierName = (label: string): string => label.split("—")[0].trim();

const HardwareCard: React.FC<HardwareCardProps> = ({
  profile,
  dense = false
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const setVramOverrideGb = useModelManagerStore(
    (state) => state.setVramOverrideGb
  );
  const override = useModelManagerStore((state) => state.vramOverrideGb);

  const handleOverrideChange = useCallback(
    (value: string) => {
      setVramOverrideGb(value === AUTO_VALUE ? null : Number(value));
    },
    [setVramOverrideGb]
  );

  const selectValue = useMemo(
    () => (override != null && override > 0 ? String(override) : AUTO_VALUE),
    [override]
  );
  const overrideOptions = useMemo(
    () => [
      { value: AUTO_VALUE, label: t("i18n-next33.hardware.autoDetect") },
      ...OVERRIDE_VALUES.map((value) => ({ value, label: `${value} GB` }))
    ],
    [t]
  );
  const hardwareTier = profile.tier ? t(`i18n-next33.hardware.tiers.${profile.tier}`) : null;

  const header = (
    <FlexRow gap={SPACING.md} align="center" sx={{ minWidth: 0 }}>
      <FlexRow
        align="center"
        justify="center"
        sx={{
          width: dense ? 36 : 44,
          height: dense ? 36 : 44,
          minWidth: dense ? 36 : 44,
          borderRadius: BORDER_RADIUS.md,
          backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
          color: theme.vars.palette.primary.main
        }}
      >
        <DeveloperBoardIcon sx={{ fontSize: dense ? 20 : 22 }} />
      </FlexRow>
      <FlexColumn sx={{ minWidth: 0 }}>
        <FlexRow gap={SPACING.xs} align="center" sx={{ flexWrap: "wrap" }}>
          <Text size="normal" weight={600}>
            {t("i18n-next33.hardware.yourMachine")}
          </Text>
          {profile.tier && hardwareTier && (
            <Tooltip title={hardwareTier}>
              <Chip
                label={tierName(hardwareTier)}
                compact
                variant="outlined"
                sx={{ cursor: "help" }}
              />
            </Tooltip>
          )}
        </FlexRow>
        {!dense && (
          <Caption sx={{ opacity: 0.65, lineHeight: 1.45 }}>
            {t(`i18n-next33.hardware.budgetNotes.${budgetNoteKey(profile)}`)}
          </Caption>
        )}
      </FlexColumn>
    </FlexRow>
  );

  const stats = (
    <>
      <ModelStat
        icon={<DeveloperBoardIcon sx={{ fontSize: ICON_SIZE.xs }} />}
        label={t("i18n-next33.hardware.gpuMemory")}
        value={gb(profile.vramGb, t("i18n-next33.hardware.unavailable"))}
      />
      <ModelStat
        icon={<MemoryIcon sx={{ fontSize: ICON_SIZE.xs }} />}
        label={t("i18n-next33.hardware.systemRam")}
        value={gb(profile.ramGb, t("i18n-next33.hardware.unavailable"))}
      />
      <ModelStat
        label={t("i18n-next33.hardware.modelBudget")}
        value={profile.budgetGb != null ? `${profile.budgetGb} GB` : t("i18n-next33.hardware.notSet")}
        highlight
      />
    </>
  );

  const budgetSelect = (
    <FlexColumn gap={SPACING.micro} sx={{ minWidth: 128 }}>
      <Caption sx={{ opacity: 0.6, whiteSpace: "nowrap" }}>
        {t("i18n-next33.hardware.setGpuMemory")}
      </Caption>
      <SelectField
        label={t("i18n-next33.hardware.gpuMemoryBudget")}
        hideLabel
        variant="outlined"
        value={selectValue}
        onChange={handleOverrideChange}
        options={overrideOptions}
      />
    </FlexColumn>
  );

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
      {dense ? (
        <FlexColumn gap={SPACING.md}>
          {header}
          <Caption sx={{ opacity: 0.65, lineHeight: 1.5 }}>
            {t(`i18n-next33.hardware.budgetNotes.${budgetNoteKey(profile)}`)}
          </Caption>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: SPACING.md
            }}
          >
            {stats}
          </Box>
          {budgetSelect}
        </FlexColumn>
      ) : (
        <FlexRow
          gap={SPACING.md}
          align="center"
          justify="space-between"
          sx={{ flexWrap: "wrap" }}
        >
          {header}
          <FlexRow gap={SPACING.lg} align="center" sx={{ flexWrap: "wrap" }}>
            {stats}
            {budgetSelect}
          </FlexRow>
        </FlexRow>
      )}
    </Card>
  );
};

export default memo(HardwareCard);
