/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import MemoryIcon from "@mui/icons-material/Memory";
import DeveloperBoardIcon from "@mui/icons-material/DeveloperBoard";
import {
  Card,
  Caption,
  Chip,
  FlexColumn,
  FlexRow,
  SelectField,
  Text,
  BORDER_RADIUS
} from "../../ui_primitives";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { TIER_LABELS, type HardwareProfile } from "./useHardwareProfile";

interface HardwareCardProps {
  profile: HardwareProfile;
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

const HardwareCard: React.FC<HardwareCardProps> = ({ profile }) => {
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
      <FlexRow gap={2} align="center" justify="space-between" sx={{ flexWrap: "wrap" }}>
        <FlexRow gap={1.5} align="center" sx={{ minWidth: 0 }}>
          <FlexRow
            align="center"
            justify="center"
            sx={{
              width: 44,
              height: 44,
              minWidth: 44,
              borderRadius: BORDER_RADIUS.md,
              backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
              color: theme.vars.palette.primary.main
            }}
          >
            <DeveloperBoardIcon sx={{ fontSize: 22 }} />
          </FlexRow>
          <FlexColumn sx={{ minWidth: 0 }}>
            <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap" }}>
              <Text size="normal" weight={600}>
                Your machine
              </Text>
              {profile.tier && (
                <Chip label={TIER_LABELS[profile.tier]} compact variant="outlined" />
              )}
            </FlexRow>
            <Caption sx={{ opacity: 0.65, lineHeight: 1.45 }}>
              {budgetNote(profile)}
            </Caption>
          </FlexColumn>
        </FlexRow>

        <FlexRow gap={3} align="center" sx={{ flexWrap: "wrap" }}>
          <Stat
            icon={<DeveloperBoardIcon sx={{ fontSize: 14 }} />}
            label="GPU memory"
            value={
              profile.vramGb != null ? `${Math.round(profile.vramGb)} GB` : "—"
            }
          />
          <Stat
            icon={<MemoryIcon sx={{ fontSize: 14 }} />}
            label="System RAM"
            value={
              profile.ramGb != null ? `${Math.round(profile.ramGb)} GB` : "—"
            }
          />
          <Stat
            label="Recommend for"
            value={
              profile.budgetGb != null ? `${profile.budgetGb} GB` : "Not set"
            }
            highlight
          />
          <FlexColumn gap={0.25} sx={{ minWidth: 128 }}>
            <Caption sx={{ opacity: 0.55, whiteSpace: "nowrap" }}>
              GPU memory
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
        </FlexRow>
      </FlexRow>
    </Card>
  );
};

interface StatProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}

const Stat: React.FC<StatProps> = ({ label, value, icon, highlight }) => {
  const theme = useTheme();
  return (
    <FlexColumn align="flex-start" gap={0.25} sx={{ minWidth: 0 }}>
      <FlexRow align="center" gap={0.5}>
        {icon}
        <Text
          size="big"
          weight={600}
          sx={{
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
            color: highlight
              ? theme.vars.palette.primary.main
              : theme.vars.palette.text.primary
          }}
        >
          {value}
        </Text>
      </FlexRow>
      <Caption sx={{ opacity: 0.55, whiteSpace: "nowrap" }}>{label}</Caption>
    </FlexColumn>
  );
};

export default memo(HardwareCard);
