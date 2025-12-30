/** @jsxImportSource @emotion/react */
import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { InputOutlined } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import OutputRenderer from "./OutputRenderer";

interface ResultOverlayProps {
  result: any;
  onShowInputs: () => void;
}

/**
 * ResultOverlay component displays the node's result output
 * with an option to switch back to the input view.
 * Fills the entire node content area for a clean, focused display.
 */
const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result,
  onShowInputs
}) => {
  const theme = useTheme();

  return (
    <Box
      className="result-overlay"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "60px",
        flex: 1,
        "&:hover .result-overlay-toggle": {
          opacity: 1
        }
      }}
    >
      {/* Toggle button to show inputs */}
      <Box
        className="result-overlay-toggle"
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          zIndex: 20,
          opacity: 0,
          transition: "opacity 0.15s ease-in-out"
        }}
      >
        <Tooltip title="Show inputs" placement="left">
          <IconButton
            size="small"
            onClick={onShowInputs}
            sx={{
              width: 24,
              height: 24,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              color: "white",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.8)"
              },
              boxShadow: theme.shadows[2]
            }}
          >
            <InputOutlined sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Render the result - fills available space */}
      <Box
        className="result-overlay-content"
        sx={{
          width: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          "& .image-output": {
            width: "100%",
            minHeight: "120px"
          }
        }}
      >
        <OutputRenderer
          value={
            typeof result === "object" &&
            result !== null &&
            "output" in result &&
            result.output !== undefined
              ? result.output
              : result
          }
        />
      </Box>
    </Box>
  );
};

export default ResultOverlay;
