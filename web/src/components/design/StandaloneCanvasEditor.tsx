/**
 * StandaloneCanvasEditor - Dedicated page for the canvas editor
 * Accessible via /canvas route without requiring authentication
 */

import React, { useState, useCallback } from "react";
import { Box, Typography, useColorScheme, Switch, FormControlLabel } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import LayoutCanvasEditor from "./LayoutCanvasEditor";
import { LayoutCanvasData, DEFAULT_CANVAS_DATA } from "./types";

const StandaloneCanvasEditor: React.FC = () => {
  const theme = useTheme();
  const { mode, setMode } = useColorScheme();
  const [canvasData, setCanvasData] = useState<LayoutCanvasData>({
    ...DEFAULT_CANVAS_DATA,
    width: 1200,
    height: 800
  });

  const handleChange = useCallback((newData: LayoutCanvasData) => {
    setCanvasData(newData);
  }, []);

  const toggleColorMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : "light");
  }, [mode, setMode]);

  return (
    <Box
      className="standalone-canvas-editor"
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      {/* Header */}
      <Box
        className="standalone-canvas-header"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper
        }}
      >
        <Typography variant="h6" component="h1">
          Canvas Editor
        </Typography>
        <Box className="standalone-canvas-header-controls" sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {canvasData.width} × {canvasData.height}px | {canvasData.elements.length} elements
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={mode === "dark"}
                onChange={toggleColorMode}
                size="small"
              />
            }
            label="Dark mode"
          />
        </Box>
      </Box>

      {/* Editor */}
      <Box className="standalone-canvas-body" sx={{ flexGrow: 1, overflow: "hidden" }}>
        <LayoutCanvasEditor
          value={canvasData}
          onChange={handleChange}
          enableSketchSupport={true}
        />
      </Box>
    </Box>
  );
};

export default StandaloneCanvasEditor;
