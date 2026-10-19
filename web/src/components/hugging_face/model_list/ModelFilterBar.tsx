import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Chip,
  FlexRow,
  NodeSlider,
  Text,
  Tooltip,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import type {
  ModelAvailabilityFilter,
  ModelSource
} from "../../../stores/ModelManagerStore";
import { MODEL_GOALS } from "./modelFit";
import { MODEL_FORMATS } from "./modelFormat";
import type { UseModelsResult } from "./useModels";

const AVAILABILITY_FILTERS: {
  value: ModelAvailabilityFilter;
  key: string;
  color: "default" | "success" | "warning";
}[] = [
  { value: "all", key: "availability.all", color: "default" },
  { value: "ready", key: "availability.ready", color: "success" },
  {
    value: "download_required",
    key: "availability.downloadRequired",
    color: "warning"
  },
  { value: "unavailable", key: "availability.unavailable", color: "default" }
];

interface FilterRowProps {
  label: string;
  children: React.ReactNode;
}

/** One labelled row of the bar. The labels share a column so they line up. */
const FilterRow: React.FC<FilterRowProps> = ({ label, children }) => (
  <>
    <Text size="small" color="secondary" sx={{ whiteSpace: "nowrap", pt: 0.5 }}>
      {label}
    </Text>
    <FlexRow gap={SPACING.xs} align="center" sx={{ flexWrap: "wrap" }}>
      {children}
    </FlexRow>
  </>
);

interface ModelFilterBarProps {
  source: ModelSource;
  availabilityCounts: UseModelsResult["availabilityCounts"];
}

/**
 * The narrowing controls for the model list: what you want the model to do,
 * which weight format it ships, whether it can run here, and how large it may
 * be. Kept in one strip so the sticky header stays a navigation row.
 */
const ModelFilterBar: React.FC<ModelFilterBarProps> = ({
  source,
  availabilityCounts
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const {
    selectedGoal,
    setSelectedGoal,
    selectedFormat,
    setSelectedFormat,
    selectedAvailability,
    setSelectedAvailability,
    maxModelSizeGB,
    setMaxModelSizeGB
  } = useModelManagerStore(
    useShallow((state) => ({
      selectedGoal: state.selectedGoal,
      setSelectedGoal: state.setSelectedGoal,
      selectedFormat: state.selectedFormat,
      setSelectedFormat: state.setSelectedFormat,
      selectedAvailability: state.selectedAvailability,
      setSelectedAvailability: state.setSelectedAvailability,
      maxModelSizeGB: state.maxModelSizeGB,
      setMaxModelSizeGB: state.setMaxModelSizeGB
    }))
  );

  const toggleGoal = useCallback(
    (goalId: string) => {
      setSelectedGoal(selectedGoal === goalId ? null : goalId);
    },
    [selectedGoal, setSelectedGoal]
  );

  const toggleFormat = useCallback(
    (formatId: string) => {
      setSelectedFormat(selectedFormat === formatId ? null : formatId);
    },
    [selectedFormat, setSelectedFormat]
  );

  const handleSizeChange = useCallback(
    (_: Event, value: number | number[]) => {
      setMaxModelSizeGB(Array.isArray(value) ? value[0] : value);
    },
    [setMaxModelSizeGB]
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr)",
        alignItems: "start",
        columnGap: SPACING.md,
        rowGap: SPACING.sm,
        mb: SPACING.md,
        pb: SPACING.md,
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <FilterRow label={t("i18n-next29.filters.goal")}>
        {MODEL_GOALS.map((goal) => (
          <Tooltip
            key={goal.id}
            title={t(`i18n-next29.filters.goals.${goal.id}.description`)}
          >
            <Chip
              label={t(`i18n-next29.filters.goals.${goal.id}.label`)}
              compact
              active={selectedGoal === goal.id}
              color={selectedGoal === goal.id ? "primary" : "default"}
              onClick={() => toggleGoal(goal.id)}
            />
          </Tooltip>
        ))}
      </FilterRow>

      <FilterRow label={t("i18n-next29.filters.format")}>
        {MODEL_FORMATS.map((format) => (
          <Chip
            key={format.id}
            label={t(`i18n-next29.filters.formats.${format.id}`)}
            compact
            active={selectedFormat === format.id}
            color={selectedFormat === format.id ? "primary" : "default"}
            onClick={() => toggleFormat(format.id)}
          />
        ))}
      </FilterRow>

      {source === "installed" && (
        <FilterRow label={t("i18n-next29.filters.status")}>
          {AVAILABILITY_FILTERS.map(({ value, key, color }) => (
            <Chip
              key={value}
              label={t("i18n-next29.filters.availabilityCount", { status: t(`i18n-next29.filters.${key}`), count: availabilityCounts[value] })}
              compact
              color={color}
              active={selectedAvailability === value}
              onClick={() => setSelectedAvailability(value)}
            />
          ))}
        </FilterRow>
      )}

      <FilterRow label={t("i18n-next29.filters.maxSize")}>
        <FlexRow
          align="center"
          sx={{
            width: 160,
            px: SPACING.xs
          }}
        >
          <NodeSlider
            aria-label={t("i18n-next29.filters.maxSizeAriaLabel")}
            value={maxModelSizeGB}
            onChange={handleSizeChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => (value === 0 ? t("i18n-next29.filters.all") : t("i18n-next29.filters.sizeGb", { count: value }))}
            step={1}
            min={0}
            max={50}
          />
        </FlexRow>
        <Text
          size="small"
          sx={{
            whiteSpace: "nowrap",
            minWidth: 46,
            fontVariantNumeric: "tabular-nums",
            borderRadius: BORDER_RADIUS.sm
          }}
        >
          {maxModelSizeGB === 0 ? t("i18n-next29.filters.allSizes") : t("i18n-next29.filters.sizeGb", { count: maxModelSizeGB })}
        </Text>
      </FilterRow>
    </Box>
  );
};

export default React.memo(ModelFilterBar);
