import React, { memo } from "react";
import { Box } from "@mui/material";

const RangeIndicator: React.FC<{
  value: number;
  min: number;
  max: number;
  isDragging: boolean;
  isEditable: boolean;
}> = ({ value, min, max, isDragging, isEditable }) => (
  <Box className="range-container-wrapper nodrag">
    <Box
      className={`range-container ${isDragging ? "dragging" : ""} ${
        isEditable ? "editable" : ""
      }`}
      tabIndex={-1}
    >
      <Box
        className="range-indicator"
        tabIndex={-1}
        style={{
          width: `${((value - min) / (max - min)) * 100}%`
        }}
      />
    </Box>
  </Box>
);

export default memo(RangeIndicator);
