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
    setMaxModelSizeGB
  } = useModelManagerStore();

  const handleSliderChange = (_: Event, value: number | number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    setMaxModelSizeGB(v);
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

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ width: 180 }}>
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
