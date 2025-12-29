/** @jsxImportSource @emotion/react */
import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { InputOutlined } from "@mui/icons-material";
import OutputRenderer from "./OutputRenderer";

interface ResultOverlayProps {
  result: any;
  onShowInputs: () => void;
}

/**
 * ResultOverlay component displays the node's result output
 * with an option to switch back to the input view.
 */
const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result,
  onShowInputs
}) => {
  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        minHeight: "100px",
        padding: 1
      }}
    >
      {/* Toggle button to show inputs */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10
        }}
      >
        <Tooltip title="Show inputs">
          <IconButton
            size="small"
            onClick={onShowInputs}
            sx={{
              backgroundColor: "background.paper",
              "&:hover": {
                backgroundColor: "action.hover"
              },
              boxShadow: 1
            }}
          >
            <InputOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Render the result */}
      <Box sx={{ paddingTop: 1 }}>
        <OutputRenderer value={result} />
      </Box>
    </Box>
  );
};

export default ResultOverlay;
