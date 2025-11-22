import React from "react";
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Typography
} from "@mui/material";
import SearchInput from "../../search/SearchInput";
import {
  useModelManagerStore,
  ModelFilterStatus
} from "../../../stores/ModelManagerStore";

interface ModelListHeaderProps {
  totalCount: number;
  filteredCount: number;
}

const ModelListHeader: React.FC<ModelListHeaderProps> = ({
  totalCount,
  filteredCount
}) => {
  const {
    modelSearchTerm,
    setModelSearchTerm,
    maxModelSizeGB,
    setMaxModelSizeGB,
    filterStatus,
    setFilterStatus
  } = useModelManagerStore();

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

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          justifyContent: "flex-end",
          pr: 2
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
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
        </Typography>

        <ToggleButtonGroup
          value={filterStatus}
          exclusive
          onChange={handleToggleChange}
          aria-label="filter models"
          size="small"
          color="primary"
          sx={{ height: "32px" }}
        >
          <ToggleButton
            value="all"
            aria-label="show all models"
            sx={{ px: 2, minWidth: "60px" }}
          >
            All
          </ToggleButton>
          <ToggleButton
            value="downloaded"
            aria-label="show downloaded models only"
            sx={{ px: 2, minWidth: "100px" }}
          >
            Downloaded
          </ToggleButton>
          <ToggleButton
            value="not_downloaded"
            aria-label="show available models only"
            sx={{ px: 2, minWidth: "100px" }}
          >
            Available
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ width: 200, minWidth: 200, mr: 2, mt: 1 }}>
          <Slider
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
      </Box>
    </>
  );
};

export default React.memo(ModelListHeader);
