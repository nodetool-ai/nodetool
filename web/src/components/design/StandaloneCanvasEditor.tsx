/**
 * StandaloneCanvasEditor - Dedicated page for the canvas editor
 * Accessible via /canvas route without requiring authentication
 */

import React, { useState, useCallback } from "react";
import {
  Box,
  Typography,
  useColorScheme,
  Switch,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import LayoutCanvasEditor from "./LayoutCanvasEditor";
import { LayoutCanvasData, DEFAULT_CANVAS_DATA } from "./types";
import type { PerfDatasetSize } from "./perfUtils";

const StandaloneCanvasEditor: React.FC = () => {
  const theme = useTheme();
  const { mode, setMode } = useColorScheme();
  const [canvasData, setCanvasData] = useState<LayoutCanvasData>({
    ...DEFAULT_CANVAS_DATA,
    width: 1200,
    height: 800
  });
  const [perfMode, setPerfMode] = useState(false);
  const [perfDatasetSize, setPerfDatasetSize] = useState<PerfDatasetSize>(1000);
  const [enablePixiRenderer, setEnablePixiRenderer] = useState(false);

  const handleChange = useCallback((newData: LayoutCanvasData) => {
    setCanvasData(newData);
  }, []);

  const toggleColorMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : "light");
  }, [mode, setMode]);

  const handlePerfModeToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPerfMode(event.target.checked);
    },
    []
  );

  const handleDatasetSizeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newValue: PerfDatasetSize | null) => {
      if (newValue) {
        setPerfDatasetSize(newValue);
      }
    },
    []
  );

  const handlePixiToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEnablePixiRenderer(event.target.checked);
    },
    []
  );

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
        <Box
          className="standalone-canvas-header-controls"
          sx={{ display: "flex", alignItems: "center", gap: 2 }}
        >
          <Typography variant="body2" color="text.secondary">
            {canvasData.width} × {canvasData.height}px |{" "}
            {perfMode ? perfDatasetSize : canvasData.elements.length} elements
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={perfDatasetSize}
            onChange={handleDatasetSizeChange}
            disabled={!perfMode}
          >
            <ToggleButton value={1000}>1k</ToggleButton>
            <ToggleButton value={5000}>5k</ToggleButton>
            <ToggleButton value={10000}>10k</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel
            control={
              <Switch
                checked={perfMode}
                onChange={handlePerfModeToggle}
                size="small"
              />
            }
            label="Perf mode"
          />
          <FormControlLabel
            control={
              <Switch
                checked={enablePixiRenderer}
                onChange={handlePixiToggle}
                size="small"
              />
            }
            label="Pixi renderer"
          />
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
          perfMode={perfMode}
          perfDatasetSize={perfDatasetSize}
          enablePixiRenderer={enablePixiRenderer}
        />
      </Box>
    </Box>
  );
};

export default StandaloneCanvasEditor;
