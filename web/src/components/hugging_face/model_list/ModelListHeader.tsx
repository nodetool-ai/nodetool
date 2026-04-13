import React, { useCallback } from "react";
import { Box } from "@mui/material";
import {
  Text,
  FlexRow,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  NodeSlider,
  NodeSelect,
  NodeMenuItem
} from "../../ui_primitives";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import type { SelectChangeEvent } from "@mui/material/Select";
import SearchInput from "../../search/SearchInput";
import {
  useModelManagerStore,
  ModelFilterStatus
} from "../../../stores/ModelManagerStore";
import type { ModelSortField } from "../../../stores/ModelManagerStore";
import { useTheme } from "@mui/material/styles";

interface ModelListHeaderProps {
  totalCount: number;
  filteredCount: number;
}

const SORT_OPTIONS: { value: ModelSortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "downloads", label: "Downloads" },
  { value: "likes", label: "Likes" }
];

const ModelListHeader: React.FC<ModelListHeaderProps> = ({
  totalCount,
  filteredCount
}) => {
  const modelSearchTerm = useModelManagerStore((state) => state.modelSearchTerm);
  const setModelSearchTerm = useModelManagerStore((state) => state.setModelSearchTerm);
  const maxModelSizeGB = useModelManagerStore((state) => state.maxModelSizeGB);
  const setMaxModelSizeGB = useModelManagerStore((state) => state.setMaxModelSizeGB);
  const filterStatus = useModelManagerStore((state) => state.filterStatus);
  const setFilterStatus = useModelManagerStore((state) => state.setFilterStatus);
  const sortField = useModelManagerStore((state) => state.sortField);
  const setSortField = useModelManagerStore((state) => state.setSortField);
  const sortDirection = useModelManagerStore((state) => state.sortDirection);
  const toggleSortDirection = useModelManagerStore((state) => state.toggleSortDirection);
  const theme = useTheme();

  const handleSliderChange = (_: Event, value: number | number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    setMaxModelSizeGB(v);
  };

  const handleToggleChange = (
    _: React.MouseEvent<HTMLElement>,
    newValue: ModelFilterStatus
  ) => {
    if (newValue !== null) {
      setFilterStatus(newValue);
    }
  };

  const handleSortFieldChange = useCallback(
    (event: SelectChangeEvent<unknown>) => {
      setSortField(event.target.value as ModelSortField);
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
          {(() => {
            if (filterStatus === "downloaded") {
              return `${filteredCount} downloaded / ${totalCount} total`;
            }
            if (filterStatus === "not_downloaded") {
              return `${filteredCount} available / ${totalCount} total`;
            }
            if (filteredCount !== totalCount) {
              return `${filteredCount} of ${totalCount} models`;
            }
            return `${totalCount} models`;
          })()}
        </Text>

        <ToggleGroup
          value={filterStatus}
          exclusive
          onChange={handleToggleChange}
          aria-label="filter models"
          size="small"
          compact
          sx={{
            height: "32px",
            background: theme.vars.palette.action.hover,
            backdropFilter: theme.vars.palette.glass.blur,
            borderRadius: "8px",
            border: `1px solid ${theme.vars.palette.divider}`,
            "& .MuiToggleButton-root": {
              border: "none",
              color: theme.vars.palette.text.secondary,
              "&.Mui-selected": {
                backgroundColor: theme.vars.palette.action.selected,
                color: theme.vars.palette.text.primary,
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.activatedOpacity
                }
              },
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover
              }
            }
          }}
        >
          <ToggleOption
            value="all"
            aria-label="show all models"
            sx={{ px: 2, minWidth: "60px", borderRadius: "8px 0 0 8px" }}
          >
            All
          </ToggleOption>
          <ToggleOption
            value="downloaded"
            aria-label="show downloaded models only"
            sx={{ px: 2, minWidth: "100px" }}
          >
            Downloaded
          </ToggleOption>
          <ToggleOption
            value="not_downloaded"
            aria-label="show available models only"
            sx={{ px: 2, minWidth: "100px", borderRadius: "0 8px 8px 0" }}
          >
            Available
          </ToggleOption>
        </ToggleGroup>

        <FlexRow align="center" gap={0.5}>
          <NodeSelect
            value={sortField}
            onChange={handleSortFieldChange}
            density="compact"
            aria-label="Sort models by"
            sx={{
              height: "32px",
              minWidth: 120,
              fontSize: "0.875rem",
              background: theme.vars.palette.action.hover,
              borderRadius: "8px",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.divider
              },
              "& .MuiSelect-select": {
                py: 0.5
              }
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <NodeMenuItem key={option.value} value={option.value}>
                {option.label}
              </NodeMenuItem>
            ))}
          </NodeSelect>
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

        <Box sx={{ width: 160, minWidth: 160, mt: 1 }}>
          <NodeSlider
            aria-label="Max model size in GB"
            value={maxModelSizeGB}
            onChange={handleSliderChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => (value === 0 ? "All" : `${value} GB`)}
            step={1}
            min={0}
            max={50}
            marks={[
              { value: 0, label: "All" },
              { value: 8, label: "8G" },
              { value: 15, label: "15G" },
              { value: 30, label: "30G" }
            ]}
            sx={{
              "& .MuiSlider-markLabel": {
                fontSize: (theme) => theme.vars.fontSizeTiny
              }
            }}
          />
        </Box>
      </FlexRow>
    </>
  );
};

export default React.memo(ModelListHeader);
