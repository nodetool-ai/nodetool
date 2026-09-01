import React, { useCallback } from "react";
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
  label: string;
  color: "default" | "success" | "warning";
}[] = [
  { value: "all", label: "All", color: "default" },
  { value: "ready", label: "Ready", color: "success" },
  {
    value: "download_required",
    label: "Download required",
    color: "warning"
  },
  { value: "unavailable", label: "Unavailable", color: "default" }
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
      <FilterRow label="I want to">
        {MODEL_GOALS.map((goal) => (
          <Tooltip key={goal.id} title={goal.description} delay={400}>
            <Chip
              label={goal.label}
              compact
              active={selectedGoal === goal.id}
              color={selectedGoal === goal.id ? "primary" : "default"}
              onClick={() => toggleGoal(goal.id)}
            />
          </Tooltip>
        ))}
      </FilterRow>

      <FilterRow label="Format">
        {MODEL_FORMATS.map((format) => (
          <Chip
            key={format.id}
            label={format.label}
            compact
            active={selectedFormat === format.id}
            color={selectedFormat === format.id ? "primary" : "default"}
            onClick={() => toggleFormat(format.id)}
          />
        ))}
      </FilterRow>

      {source === "installed" && (
        <FilterRow label="Status">
          {AVAILABILITY_FILTERS.map(({ value, label, color }) => (
            <Chip
              key={value}
              label={`${label} ${availabilityCounts[value]}`}
              compact
              color={color}
              active={selectedAvailability === value}
              onClick={() => setSelectedAvailability(value)}
            />
          ))}
        </FilterRow>
      )}

      <FilterRow label="Max size">
        <FlexRow
          align="center"
          sx={{
            width: 160,
            px: SPACING.xs
          }}
        >
          <NodeSlider
            aria-label="Max model size in GB"
            value={maxModelSizeGB}
            onChange={handleSizeChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => (value === 0 ? "All" : `${value} GB`)}
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
          {maxModelSizeGB === 0 ? "All sizes" : `${maxModelSizeGB} GB`}
        </Text>
      </FilterRow>
    </Box>
  );
};

export default React.memo(ModelFilterBar);
