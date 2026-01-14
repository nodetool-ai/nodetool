/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import {
  Box,
  Switch,
  Typography,
  Slider,
  Button,
  IconButton,
  Tooltip,
  FormControl,
  Select,
  MenuItem,
  Divider
} from "@mui/material";
import GridOnIcon from "@mui/icons-material/GridOn";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import { useGridSettingsStore } from "../../stores/GridSettingsStore";

const panelStyles = (theme: Theme) =>
  css({
    "& .grid-panel": {
      position: "absolute",
      top: "60px",
      right: "10px",
      width: "280px",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
      padding: "16px",
      zIndex: 1000,
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: "fadeIn 0.2s ease-out forwards"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "translateY(-10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "12px"
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "0.9rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "12px",
      "&:last-child": {
        marginBottom: 0
      }
    },
    "& .setting-label": {
      fontSize: "0.8rem",
      color: theme.vars.palette.text.secondary
    },
    "& .setting-control": {
      width: "120px"
    },
    "& .slider-container": {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    },
    "& .slider-value": {
      fontSize: "0.75rem",
      minWidth: "40px",
      textAlign: "right",
      color: theme.vars.palette.text.secondary
    },
    "& .divider": {
      margin: "12px 0"
    }
  });

const colorPresets = [
  { label: "Gray", color: "#888888" },
  { label: "Light", color: "#cccccc" },
  { label: "Dark", color: "#444444" },
  { label: "Blue", color: "#4a9eff" },
  { label: "Green", color: "#4caf50" },
  { label: "Red", color: "#ef5350" }
];

const GridCustomizationPanel: React.FC = () => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => panelStyles(theme), [theme]);

  const { gridSettings, setGridVisible, setGridGap, setGridSize, setGridColor, setGridVariant, resetGridSettings, isPanelOpen, setPanelOpen } =
    useGridSettingsStore();

  const handleGapChange = useCallback(
    (_: Event, value: number | number[]) => {
      setGridGap(value as number);
    },
    [setGridGap]
  );

  const handleSizeChange = useCallback(
    (_: Event, value: number | number[]) => {
      setGridSize(value as number);
    },
    [setGridSize]
  );

  const handleReset = useCallback(() => {
    resetGridSettings();
  }, [resetGridSettings]);

  const handleClose = useCallback(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);

  if (!isPanelOpen) {
    return null;
  }

  return (
    <div css={memoizedStyles}>
      <div className="grid-panel">
        <div className="panel-header">
          <Typography variant="subtitle1" className="panel-title">
            <GridOnIcon fontSize="small" />
            Grid Settings
          </Typography>
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>

        <Divider className="divider" />

        <div className="setting-row">
          <Typography className="setting-label">Show Grid</Typography>
          <Switch
            checked={gridSettings.visible}
            onChange={(_, checked) => setGridVisible(checked)}
            size="small"
          />
        </div>

        <div className="setting-row">
          <Typography className="setting-label">Grid Variant</Typography>
          <FormControl size="small" className="setting-control">
            <Select
              value={gridSettings.variant}
              onChange={(e) => setGridVariant(e.target.value as "dots" | "cross")}
              size="small"
            >
              <MenuItem value="cross">Cross</MenuItem>
              <MenuItem value="dots">Dots</MenuItem>
            </Select>
          </FormControl>
        </div>

        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Typography className="setting-label">Gap</Typography>
            <Typography className="slider-value">{gridSettings.gap}px</Typography>
          </div>
          <Slider
            value={gridSettings.gap}
            onChange={handleGapChange}
            min={10}
            max={100}
            step={5}
            size="small"
          />
        </div>

        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Typography className="setting-label">Line Width</Typography>
            <Typography className="slider-value">{gridSettings.size.toFixed(1)}</Typography>
          </div>
          <Slider
            value={gridSettings.size}
            onChange={handleSizeChange}
            min={0.5}
            max={3}
            step={0.1}
            size="small"
          />
        </div>

        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <Typography className="setting-label" style={{ marginBottom: "8px" }}>
            Color
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap"
            }}
          >
            {colorPresets.map((preset) => (
              <Tooltip key={preset.label} title={preset.label}>
                <Box
                  onClick={() => setGridColor(preset.color)}
                  sx={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "4px",
                    backgroundColor: preset.color,
                    cursor: "pointer",
                    border:
                      gridSettings.color === preset.color
                        ? `2px solid ${theme.vars.palette.primary.main}`
                        : "2px solid transparent",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      transform: "scale(1.1)"
                    }
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        </div>

        <Divider className="divider" />

        <Box sx={{ display: "flex", gap: "8px" }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleReset}
            sx={{ flex: 1 }}
          >
            Reset
          </Button>
        </Box>
      </div>
    </div>
  );
};

export default memo(GridCustomizationPanel);
