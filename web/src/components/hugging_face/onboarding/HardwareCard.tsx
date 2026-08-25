import React, { memo, useCallback, useMemo } from "react";
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
  SPACING
} from "../../ui_primitives";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { ModelStat } from "../ModelStat";
import { TIER_LABELS, type HardwareProfile } from "./useHardwareProfile";

interface HardwareCardProps {
  profile: HardwareProfile;
  /**
   * Narrow-column layout: header, stats, and the budget select stack instead
   * of sitting on one row. Used by the model manager's info rail.
   */
  dense?: boolean;
}

const AUTO_VALUE = "auto";
const OVERRIDE_OPTIONS = [
  { value: AUTO_VALUE, label: "Auto-detect" },
  { value: "4", label: "4 GB" },
  { value: "6", label: "6 GB" },
  { value: "8", label: "8 GB" },
  { value: "12", label: "12 GB" },
  { value: "16", label: "16 GB" },
  { value: "24", label: "24 GB" },
  { value: "32", label: "32 GB" },
  { value: "48", label: "48 GB" }
];

const budgetNote = (profile: HardwareProfile): string => {
  switch (profile.budgetSource) {
    case "gpu":
      return "Detected from your GPU.";
    case "unified-memory":
      return "Estimated from system memory — set your GPU's VRAM for a sharper match.";
    case "manual":
      return "Using the value you set.";
    default:
      return "We couldn't detect your hardware. Pick your GPU memory to get recommendations.";
  }
};

const gb = (value: number | null | undefined): string =>
  value != null ? `${Math.round(value)} GB` : "—";

/** Tier labels read "Name — what it runs"; the chip shows the name only. */
const tierName = (label: string): string => label.split("—")[0].trim();

const HardwareCard: React.FC<HardwareCardProps> = ({
  profile,
  dense = false
}) => {
  const theme = useTheme();
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
            Your machine
          </Text>
          {profile.tier && (
            <Tooltip title={TIER_LABELS[profile.tier]} delay={400}>
              <Chip
                label={tierName(TIER_LABELS[profile.tier])}
                compact
                variant="outlined"
                sx={{ cursor: "help" }}
              />
            </Tooltip>
          )}
        </FlexRow>
        {!dense && (
          <Caption sx={{ opacity: 0.65, lineHeight: 1.45 }}>
            {budgetNote(profile)}
          </Caption>
        )}
      </FlexColumn>
    </FlexRow>
  );

  const stats = (
    <>
      <ModelStat
        icon={<DeveloperBoardIcon sx={{ fontSize: 14 }} />}
        label="GPU memory"
        value={gb(profile.vramGb)}
      />
      <ModelStat
        icon={<MemoryIcon sx={{ fontSize: 14 }} />}
        label="System RAM"
        value={gb(profile.ramGb)}
      />
      <ModelStat
        label="Model budget"
        value={profile.budgetGb != null ? `${profile.budgetGb} GB` : "Not set"}
        highlight
      />
    </>
  );

  const budgetSelect = (
    <FlexColumn gap={SPACING.micro} sx={{ minWidth: 128 }}>
      <Caption sx={{ opacity: 0.6, whiteSpace: "nowrap" }}>
        Set GPU memory
      </Caption>
      <SelectField
        label="GPU memory budget"
        hideLabel
        variant="outlined"
        value={selectValue}
        onChange={handleOverrideChange}
        options={OVERRIDE_OPTIONS}
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
            {budgetNote(profile)}
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
