/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import OutputRenderer from "./OutputRenderer";

interface ResultOverlayProps {
  result: any;
  onShowInputs?: () => void; // Kept for backwards compatibility but now handled in NodeHeader
}

/**
 * ResultOverlay component displays the node's result output.
 * Fills the entire node content area for a clean, focused display.
 */
const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result
}) => {
  return (
    <Box
      className="result-overlay node-drag-handle"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: "60px",
        minWidth: 0,
        flex: 1
      }}
    >
      {/* Render the result - fills available space */}
      <Box
        className="result-overlay-content"
        sx={{
          width: "100%",
          height: "100%",
          minHeight: 0,
          minWidth: 0,
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
