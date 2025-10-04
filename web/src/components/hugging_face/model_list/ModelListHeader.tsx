import React from "react";
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Typography
} from "@mui/material";
import SearchInput from "../../search/SearchInput";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";

const ModelListHeader: React.FC = () => {
  const {
    modelSearchTerm,
    setModelSearchTerm,
    maxModelSizeGB,
    setMaxModelSizeGB,
    showDownloadedOnly,
    setShowDownloadedOnly
  } = useModelManagerStore();

  const handleSliderChange = (_: Event, value: number | number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    setMaxModelSizeGB(v);
  };

  const handleToggleChange = (
    _: React.MouseEvent<HTMLElement>,
    newValue: boolean
  ) => {
    if (newValue !== null) {
      setShowDownloadedOnly(newValue);
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
          gap: 3,
          flex: 1,
          justifyContent: "flex-end",
          pr: 2
        }}
      >
        <ToggleButtonGroup
          value={showDownloadedOnly}
          exclusive
          onChange={handleToggleChange}
          aria-label="show downloaded models only"
          size="small"
          sx={{ height: "32px" }}
        >
          <ToggleButton
            value={false}
            aria-label="show all models"
            sx={{ px: 2, minWidth: "60px" }}
          >
            All
          </ToggleButton>
          <ToggleButton
            value={true}
            aria-label="show downloaded models only"
            sx={{ px: 2, minWidth: "100px" }}
          >
            Downloaded
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ width: 200, minWidth: 200, mr: 2 }}>
          <Slider
            aria-label="Max model size in GB"
            value={maxModelSizeGB}
            onChange={handleSliderChange}
            valueLabelDisplay="off"
            step={1}
            min={0}
            max={50}
            marks={[
              { value: 0, label: "All" },
              { value: 8, label: "8G" },
              { value: 15, label: "15G" },
              { value: 30, label: "30G" }
            ]}
          />
        </Box>
      </Box>
    </>
  );
};

export default React.memo(ModelListHeader);
