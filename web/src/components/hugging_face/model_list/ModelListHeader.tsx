import React, { useCallback } from "react";
import {
  Text,
  FlexRow,
  ToolbarIconButton,
  SelectField,
  Box,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
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
import { useModelDownloadTarget } from "../../../hooks/useModelDownloadTarget";
import { Caption, Tooltip } from "../../ui_primitives";

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
  { value: "fit", label: "Best fit" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "downloads", label: "Downloads" },
  { value: "likes", label: "Likes" }
];

/**
 * Toolbar look for the general SelectField (not the editor-scoped NodeSelect,
 * which forces an 11px font). The fit-content wrapper defeats SelectField's
 * internal `FormControl fullWidth` so the control shrink-wraps its value and
 * the chevron sits right after the text.
 */
const toolbarSelectSx = (theme: Theme) => ({
  display: "inline-flex",
  width: "fit-content",
  "& .MuiInputBase-root": {
    height: CONTROL.height.md,
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
    padding: `0 ${getSpacingPx(SPACING.xxxl)} 0 ${getSpacingPx(SPACING.lg)}`,
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
});

const resultLabel = (
  source: ModelSource,
  filteredCount: number,
  totalCount: number
): string => {
  if (source === "hub") {
    return filteredCount >= HUB_RESULT_LIMIT
      ? `Top ${HUB_RESULT_LIMIT} results`
      : `${filteredCount} result${filteredCount === 1 ? "" : "s"}`;
  }
  return filteredCount !== totalCount
    ? `${filteredCount} of ${totalCount} models`
    : `${totalCount} models`;
};

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
    sortField,
    setSortField,
    sortDirection,
    toggleSortDirection
  } = useModelManagerStore(
    useShallow((state) => ({
      modelSearchTerm: state.modelSearchTerm,
      setModelSearchTerm: state.setModelSearchTerm,
      sortField: state.sortField,
      setSortField: state.setSortField,
      sortDirection: state.sortDirection,
      toggleSortDirection: state.toggleSortDirection
    }))
  );
  const theme = useTheme();
  const isOnboarding = source === "onboarding";
  // The Local/Worker toggle changes what you browse; downloads always land on
  // the attached worker while one is connected. State that explicitly so the
  // view toggle never reads as a download destination.
  const { scope: downloadScope, label: downloadTargetLabel } =
    useModelDownloadTarget();

  const handleSortFieldChange = useCallback(
    (value: string) => {
      setSortField(value as ModelSortField);
    },
    [setSortField]
  );

  if (isOnboarding) {
    return (
      <FlexRow align="center" justify="flex-end" sx={{ flex: 1 }}>
        <SourceToggle source={source} onChange={onSourceChange} />
      </FlexRow>
    );
  }

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

      <Text
        size="small"
        color="secondary"
        sx={{ whiteSpace: "nowrap", mr: "auto", ml: SPACING.md }}
      >
        {resultLabel(source, filteredCount, totalCount)}
      </Text>

      <FlexRow align="center" gap={SPACING.md} sx={{ flexShrink: 0 }}>
        <SourceToggle source={source} onChange={onSourceChange} />

        <ScopeToggle
          scope={scope}
          onChange={onScopeChange}
          workerName={workerName}
          supported={workerSupported}
        />

        {downloadScope === "worker" && (
          <Tooltip
            title={`Every model you download lands on ${downloadTargetLabel} while this worker is attached.`}
          >
            <Caption
              sx={{
                whiteSpace: "nowrap",
                color: "text.secondary",
                flexShrink: 0
              }}
            >
              Downloads → {downloadTargetLabel}
            </Caption>
          </Tooltip>
        )}

        <FlexRow align="center" gap={SPACING.xs}>
          <Text size="small" color="secondary" sx={{ whiteSpace: "nowrap" }}>
            Sort
          </Text>
          <Box sx={toolbarSelectSx(theme)}>
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
              "&:hover": { color: theme.vars.palette.text.primary }
            }}
          />
        </FlexRow>
      </FlexRow>
    </>
  );
};

export default React.memo(ModelListHeader);
