/** @jsxImportSource @emotion/react */
import { useCallback } from "react";
import { Box, Typography, Slider, FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip } from "@mui/material";
import { useGridSettingsStore, GridPattern } from "../../stores/GridSettingsStore";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import GridOnIcon from "@mui/icons-material/GridOn";
import Grid4x4Icon from "@mui/icons-material/Grid4x4";

const patternOrder: GridPattern[] = ["dots", "lines", "cross", "none"];

const patternLabels: Record<GridPattern, string> = {
  dots: "Dots",
  lines: "Lines",
  cross: "Cross",
  none: "None"
};

const patternIcons: Record<GridPattern, React.ReactNode> = {
  dots: <Grid4x4Icon />,
  lines: <GridOnIcon />,
  cross: (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
      <Box sx={{ width: 12, height: 2, bgcolor: "currentColor" }} />
      <Box sx={{ width: 2, height: 8, bgcolor: "currentColor", mx: "auto" }} />
      <Box sx={{ width: 12, height: 2, bgcolor: "currentColor" }} />
    </Box>
  ),
  none: null
};

interface GridSettingsProps {
  compact?: boolean;
}

export const GridSettings: React.FC<GridSettingsProps> = ({ compact = false }) => {
  const theme = useTheme();
  const settings = useGridSettingsStore();

  const handlePatternChange = useCallback(
    (event: any) => {
      settings.setPattern(event.target.value as GridPattern);
    },
    [settings]
  );

  const handleGapChange = useCallback(
    (_: Event, value: number | number[]) => {
      settings.setGap(value as number);
    },
    [settings]
  );

  const handleSizeChange = useCallback(
    (_: Event, value: number | number[]) => {
      settings.setSize(value as number);
    },
    [settings]
  );

  const handleReset = useCallback(() => {
    settings.resetToDefaults();
  }, [settings]);

  if (compact) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1
        }}
      >
        <Tooltip title={`Grid: ${settings.visible ? "Visible" : "Hidden"}`}>
          <IconButton
            onClick={settings.toggleVisibility}
            size="small"
            color={settings.visible ? "primary" : "default"}
          >
            {settings.visible ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Grid Pattern">
          <IconButton onClick={settings.cyclePattern} size="small">
            {patternIcons[settings.pattern] || <Grid4x4Icon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {patternLabels[settings.pattern]}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        borderTop: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Canvas Grid
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title={settings.visible ? "Hide Grid" : "Show Grid"}>
            <IconButton onClick={settings.toggleVisibility} size="small" color={settings.visible ? "primary" : "default"}>
              {settings.visible ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset to Defaults">
            <IconButton onClick={handleReset} size="small">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>Pattern</InputLabel>
        <Select
          value={settings.pattern}
          label="Pattern"
          onChange={handlePatternChange}
          disabled={!settings.visible}
        >
          {patternOrder.map((pattern: GridPattern) => (
            <MenuItem key={pattern} value={pattern}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {patternIcons[pattern]}
                <span>{patternLabels[pattern]}</span>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {settings.visible && settings.pattern !== "none" && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Gap: {settings.gap}px
            </Typography>
            <Slider
              value={settings.gap}
              min={20}
              max={200}
              step={10}
              onChange={handleGapChange}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}px`}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Size: {settings.size}px
            </Typography>
            <Slider
              value={settings.size}
              min={1}
              max={20}
              step={1}
              onChange={handleSizeChange}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}px`}
            />
          </Box>
        </>
      )}

      {settings.pattern === "none" && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
          Grid is hidden
        </Typography>
      )}
    </Box>
  );
};

export default GridSettings;
