/** @jsxImportSource @emotion/react */
import React from "react";
import { Box, Button } from "@mui/material";
import { InputOutlined } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import OutputRenderer from "./OutputRenderer";

interface ResultOverlayProps {
  result: any;
  onShowInputs?: () => void;
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
        height: "100%",
        minHeight: "60px",
        minWidth: 0,
        flex: 1,
        "&:hover .show-inputs-button": {
          opacity: 1,
          transform: "translateY(0)"
        }
      }}
    >
      {/* Toggle button to show inputs - only shown on hover */}
      {onShowInputs && (
        <Box
          className="show-inputs-button"
          sx={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%) translateY(-4px)",
            zIndex: 20,
            opacity: 0,
            transition: "opacity 0.2s ease, transform 0.2s ease"
          }}
        >
          <Button
            size="small"
            startIcon={<InputOutlined sx={{ fontSize: 16 }} />}
            onClick={onShowInputs}
            sx={{
              textTransform: "none",
              fontSize: "0.75rem",
              padding: "4px 12px",
              backgroundColor: theme.vars.palette.background.paper,
              color: theme.vars.palette.text.primary,
              border: `1px solid ${theme.vars.palette.divider}`,
              borderRadius: "16px",
              backdropFilter: theme.vars.palette.glass.blur,
              boxShadow: 1,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                borderColor: theme.vars.palette.primary.main
              }
            }}
          >
            Show Inputs
          </Button>
        </Box>
      )}

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
