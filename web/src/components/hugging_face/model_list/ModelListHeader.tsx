import React, { useCallback } from "react";
import {
  Text,
  FlexRow,
  ToolbarIconButton,
  NodeSlider,
  SelectField,
  Box, BORDER_RADIUS, SPACING, getSpacingPx } from "../../ui_primitives";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SearchInput from "../../search/SearchInput";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import type {
  ModelSortField,
  ModelScope,
  ModelSource
} from "../../../stores/ModelManagerStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import { ScopeToggle } from "./ScopeToggle";
import { SourceToggle } from "./SourceToggle";
import { HUB_RESULT_LIMIT } from "./useModels";

interface ModelListHeaderProps {
  totalCount: number;
  filteredCount: number;
  scope: ModelScope;
  onScopeChange: (scope: ModelScope) => void;
  source: ModelSource;
  onSourceChange: (source: ModelSource) => void;
  /** Attached worker display name, or null when no worker is attached. */
  workerName: string | null;
  /** Whether the attached worker supports model management. */
  workerSupported: boolean;
}

const SORT_OPTIONS: { value: ModelSortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "downloads", label: "Downloads" },
  { value: "likes", label: "Likes" }
];

/** Thin vertical separator used to group the toolbar's control clusters. */
const dividerSx = (theme: Theme) => ({
  alignSelf: "center",
  width: "1px",
  height: 22,
  flexShrink: 0,
  backgroundColor: theme.vars.palette.divider
});

const ModelListHeader: React.FC<ModelListHeaderProps> = ({
  totalCount,
  filteredCount,
  scope,
  onScopeChange,
  source,
  onSourceChange,
  workerName,
  workerSupported
}) => {
  const {
    modelSearchTerm,
    setModelSearchTerm,
    maxModelSizeGB,
    setMaxModelSizeGB,
    sortField,
    setSortField,
    sortDirection,
    toggleSortDirection
  } = useModelManagerStore(
    useShallow((state) => ({
      modelSearchTerm: state.modelSearchTerm,
      setModelSearchTerm: state.setModelSearchTerm,
      maxModelSizeGB: state.maxModelSizeGB,
      setMaxModelSizeGB: state.setMaxModelSizeGB,
      sortField: state.sortField,
      setSortField: state.setSortField,
      sortDirection: state.sortDirection,
      toggleSortDirection: state.toggleSortDirection
    }))
  );
  const theme = useTheme();

  const handleSliderChange = (_: Event, value: number | number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    setMaxModelSizeGB(v);
  };

  const handleSortFieldChange = useCallback(
    (value: string) => {
      setSortField(value as ModelSortField);
    },
    [setSortField]
  );

  return (
    <>
      <SearchInput
        focusOnTyping={true}
        focusSearchInput={false}
        width={250}
        maxWidth={"300px"}
        onSearchChange={setModelSearchTerm}
        searchTerm={modelSearchTerm}
      />

      <FlexRow
        sx={{
          alignItems: "center",
          gap: 2,
          flex: 1,
          justifyContent: "flex-end",
          pr: 2
        }}
      >
        <Text
          size="small"
          color="secondary"
          sx={{ whiteSpace: "nowrap", mr: "auto", ml: 2 }}
        >
          {source === "hub"
            ? filteredCount >= HUB_RESULT_LIMIT
              ? `Top ${HUB_RESULT_LIMIT} results`
              : `${filteredCount} result${filteredCount === 1 ? "" : "s"}`
            : filteredCount !== totalCount
              ? `${filteredCount} of ${totalCount} models`
              : `${totalCount} models`}
        </Text>

        <SourceToggle source={source} onChange={onSourceChange} />

        <ScopeToggle
          scope={scope}
          onChange={onScopeChange}
          workerName={workerName}
          supported={workerSupported}
        />

        <Box sx={dividerSx(theme)} />

        <FlexRow align="center" gap={1.25}>
          <Text size="small" color="secondary" sx={{ whiteSpace: "nowrap" }}>
            Sort
          </Text>
          {/* General SelectField (not the editor-scoped NodeSelect, which
              forces an 11px font via .nt-editor-scope-node). The fit-content
              wrapper defeats SelectField's internal `FormControl fullWidth` so
              the control shrink-wraps its value and the chevron sits right after
              the text. Toolbar look (32px pill, divider border, chevron tint) is
              applied here via descendant selectors. */}
          <Box
            sx={{
              display: "inline-flex",
              width: "fit-content",
              "& .MuiInputBase-root": {
                height: 32,
                minWidth: 92,
                backgroundColor: theme.vars.palette.action.hover,
                borderRadius: BORDER_RADIUS.lg,
                fontSize: "var(--fontSizeNormal)"
              },
              "& .MuiSelect-select": {
                display: "flex",
                alignItems: "center",
                minHeight: 0,
                boxSizing: "border-box",
                padding: `0 ${getSpacingPx(SPACING.xxxl)} 0 ${getSpacingPx(SPACING.lg)}`, // was 0 30px 0 12px
                lineHeight: 1
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.divider
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.text.secondary
              },
              "& .MuiSelect-icon": {
                color: theme.vars.palette.text.secondary,
                right: 6
              }
            }}
          >
            <SelectField
              label="Sort models by"
              hideLabel
              variant="outlined"
              value={sortField}
              onChange={handleSortFieldChange}
              options={SORT_OPTIONS}
            />
          </Box>
          <ToolbarIconButton
            icon={
              sortDirection === "asc" ? (
                <ArrowUpwardIcon fontSize="small" />
              ) : (
                <ArrowDownwardIcon fontSize="small" />
              )
            }
            tooltip={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
            onClick={toggleSortDirection}
            size="small"
            aria-label="Toggle sort direction"
            sx={{
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                color: theme.vars.palette.text.primary
              }
            }}
          />
        </FlexRow>

        <Box sx={dividerSx(theme)} />

        {/* Max-size limit: a labeled, mark-free slider with the current value
            shown inline. The old version used always-on tick marks that bled
            into the row below and lacked a label. */}
        <FlexRow align="center" gap={1.25} sx={{ flexShrink: 0 }}>
          <Text
            size="small"
            color="secondary"
            sx={{ whiteSpace: "nowrap" }}
          >
            Max size
          </Text>
          <Box
            sx={{
              width: 124,
              px: getSpacingPx(SPACING.sm),
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center"
            }}
          >
            <NodeSlider
              aria-label="Max model size in GB"
              value={maxModelSizeGB}
              onChange={handleSliderChange}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => (value === 0 ? "All" : `${value} GB`)}
              step={1}
              min={0}
              max={50}
            />
          </Box>
          <Text
            size="small"
            sx={{
              whiteSpace: "nowrap",
              minWidth: 46,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              color: theme.vars.palette.text.primary
            }}
          >
            {maxModelSizeGB === 0 ? "All" : `${maxModelSizeGB} GB`}
          </Text>
        </FlexRow>
      </FlexRow>
    </>
  );
};

export default React.memo(ModelListHeader);
