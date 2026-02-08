/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Slider,
  TextField,
  Button
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  GradientValue,
  GradientStop,
  gradientToCss
} from "../../stores/ColorPickerStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    },
    ".gradient-preview": {
      width: "100%",
      height: "60px",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      position: "relative",
      overflow: "hidden"
    },
    ".stops-container": {
      position: "relative",
      width: "100%",
      height: "24px",
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "4px",
      marginTop: "8px"
    },
    ".stop-marker": {
      position: "absolute",
      width: "16px",
      height: "24px",
      transform: "translateX(-50%)",
      cursor: "pointer",
      borderRadius: "2px",
      border: `2px solid white`,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
      "&:hover": {
        zIndex: 10
      },
      "&.selected": {
        borderColor: theme.vars.palette.primary.main,
        zIndex: 10
      }
    },
    ".stop-controls": {
      display: "flex",
      gap: "8px",
      alignItems: "center",
      marginTop: "8px"
    },
    ".angle-control": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginTop: "8px"
    },
    ".css-output": {
      marginTop: "12px",
      padding: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: "4px",
      fontSize: "11px",
      fontFamily: "monospace",
      wordBreak: "break-all",
      color: theme.vars.palette.grey[300]
    },
    ".actions": {
      display: "flex",
      gap: "8px",
      marginTop: "8px"
    }
  });

interface GradientBuilderProps {
  gradient: GradientValue;
  onChange: (gradient: GradientValue) => void;
  currentColor: string; // current selected color to add as stop
}

const DEFAULT_GRADIENT: GradientValue = {
  type: "linear",
  angle: 90,
  stops: [
    { color: "#ff0000", position: 0 },
    { color: "#0000ff", position: 100 }
  ]
};

const GradientBuilder: React.FC<GradientBuilderProps> = React.memo(({
  gradient = DEFAULT_GRADIENT,
  onChange,
  currentColor
}) => {
  const theme = useTheme();
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(0);

  const cssOutput = useMemo(() => gradientToCss(gradient), [gradient]);

  const handleTypeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newType: "linear" | "radial" | null) => {
      if (newType) {
        onChange({ ...gradient, type: newType });
      }
    },
    [gradient, onChange]
  );

  const handleAngleChange = useCallback(
    (_: Event, newValue: number | number[]) => {
      onChange({ ...gradient, angle: newValue as number });
    },
    [gradient, onChange]
  );

  const handleStopColorChange = useCallback(
    (index: number, color: string) => {
      const newStops = [...gradient.stops];
      newStops[index] = { ...newStops[index], color };
      onChange({ ...gradient, stops: newStops });
    },
    [gradient, onChange]
  );

  const handleStopPositionChange = useCallback(
    (index: number, position: number) => {
      const newStops = [...gradient.stops];
      newStops[index] = { ...newStops[index], position };
      onChange({ ...gradient, stops: newStops });
    },
    [gradient, onChange]
  );

  const addStop = useCallback(() => {
    // Find a good position for the new stop
    const positions = gradient.stops.map((s) => s.position).sort((a, b) => a - b);
    let newPosition = 50;

    // Find the largest gap
    let maxGap = 0;
    let gapPosition = 50;
    for (let i = 0; i < positions.length - 1; i++) {
      const gap = positions[i + 1] - positions[i];
      if (gap > maxGap) {
        maxGap = gap;
        gapPosition = positions[i] + gap / 2;
      }
    }

    if (maxGap > 0) {
      newPosition = gapPosition;
    }

    const newStop: GradientStop = {
      color: currentColor,
      position: Math.round(newPosition)
    };

    const newStops = [...gradient.stops, newStop].sort(
      (a, b) => a.position - b.position
    );
    onChange({ ...gradient, stops: newStops });
    setSelectedStopIndex(newStops.findIndex((s) => s === newStop));
  }, [gradient, onChange, currentColor]);

  const removeStop = useCallback(
    (index: number) => {
      if (gradient.stops.length <= 2) { return; } // Minimum 2 stops

      const newStops = gradient.stops.filter((_, i) => i !== index);
      onChange({ ...gradient, stops: newStops });

      if (selectedStopIndex === index) {
        setSelectedStopIndex(0);
      } else if (selectedStopIndex !== null && selectedStopIndex > index) {
        setSelectedStopIndex(selectedStopIndex - 1);
      }
    },
    [gradient, onChange, selectedStopIndex]
  );

  const handleStopClick = useCallback(
    (index: number) => () => {
      setSelectedStopIndex(index);
    },
    []
  );

  const handleApplyCurrentColor = useCallback(
    (index: number) => () => {
      handleStopColorChange(index, currentColor);
    },
    [handleStopColorChange, currentColor]
  );

  const handleRemoveStopClick = useCallback(
    (index: number) => () => {
      removeStop(index);
    },
    [removeStop]
  );

  const handleStopDrag = useCallback(
    (index: number, e: React.MouseEvent) => {
      const container = e.currentTarget.parentElement;
      if (!container) { return; }

      setSelectedStopIndex(index);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const position = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)));
        handleStopPositionChange(index, position);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [handleStopPositionChange]
  );

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(cssOutput);
  }, [cssOutput]);

  const selectedStop =
    selectedStopIndex !== null ? gradient.stops[selectedStopIndex] : null;

  return (
    <Box css={styles(theme)}>
      {/* Gradient Preview */}
      <div className="gradient-preview" style={{ background: cssOutput }} />

      {/* Type Selector */}
      <ToggleButtonGroup
        value={gradient.type}
        exclusive
        onChange={handleTypeChange}
        size="small"
        sx={{
          "& .MuiToggleButton-root": {
            fontSize: "11px",
            padding: "4px 12px",
            textTransform: "none"
          }
        }}
      >
        <ToggleButton value="linear">Linear</ToggleButton>
        <ToggleButton value="radial">Radial</ToggleButton>
      </ToggleButtonGroup>

      {/* Angle Control (for linear gradients) */}
      {gradient.type === "linear" && (
        <div className="angle-control">
          <Typography variant="caption" sx={{ minWidth: "50px" }}>
            Angle: {gradient.angle}°
          </Typography>
          <Slider
            value={gradient.angle ?? 90}
            onChange={handleAngleChange}
            min={0}
            max={360}
            size="small"
          />
        </div>
      )}

      {/* Color Stops */}
      <div>
        <Typography variant="caption" color="textSecondary">
          Color Stops
        </Typography>
        <div className="stops-container" style={{ background: cssOutput }}>
          {gradient.stops.map((stop, index) => (
            <div
              key={index}
              className={`stop-marker ${selectedStopIndex === index ? "selected" : ""}`}
              style={{
                left: `${stop.position}%`,
                backgroundColor: stop.color
              }}
              onMouseDown={(e) => handleStopDrag(index, e)}
              onClick={handleStopClick(index)}
            />
          ))}
        </div>
      </div>

      {/* Selected Stop Controls */}
      {selectedStop && selectedStopIndex !== null && (
        <div className="stop-controls">
          <TextField
            size="small"
            label="Color"
            value={selectedStop.color}
            onChange={(e) => handleStopColorChange(selectedStopIndex, e.target.value)}
            sx={{ width: "100px" }}
          />
          <TextField
            size="small"
            label="Position"
            type="number"
            value={selectedStop.position}
            onChange={(e) =>
              handleStopPositionChange(
                selectedStopIndex,
                Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
              )
            }
            InputProps={{
              endAdornment: <Typography variant="caption">%</Typography>
            }}
            sx={{ width: "80px" }}
          />
          <Tooltip title="Use current color">
            <Button
              size="small"
              variant="outlined"
              onClick={handleApplyCurrentColor(selectedStopIndex)}
              sx={{ minWidth: "auto", px: 1 }}
            >
              Apply
            </Button>
          </Tooltip>
          <Tooltip title="Remove stop">
            <IconButton
              size="small"
              onClick={handleRemoveStopClick(selectedStopIndex)}
              disabled={gradient.stops.length <= 2}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      )}

      {/* Actions */}
      <div className="actions">
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addStop}
          variant="outlined"
        >
          Add Stop
        </Button>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={copyToClipboard}
          variant="outlined"
        >
          Copy CSS
        </Button>
      </div>

      {/* CSS Output */}
      <div className="css-output">{cssOutput}</div>
    </Box>
  );
});

GradientBuilder.displayName = 'GradientBuilder';

export default memo(GradientBuilder);
