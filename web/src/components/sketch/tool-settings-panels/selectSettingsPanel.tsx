import React, { memo, useState } from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CropIcon from "@mui/icons-material/Crop";
import GestureOutlinedIcon from "@mui/icons-material/GestureOutlined";
import PentagonOutlinedIcon from "@mui/icons-material/PentagonOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import {
  iconButtonCompactSx,
  sketchButtonSmallSx,
  sketchSliderSx,
  SKETCH_COLORS
} from "../sketchStyles";
import { SelectSettings, SelectToolMode } from "../types";
import { useSketchStore } from "../state";
import { selectModeToggleButtonSx } from "./shared";

interface SelectSettingsPanelProps {
  settings: SelectSettings;
  onChange: (settings: Partial<SelectSettings>) => void;
  hasActiveSelection: boolean;
  onInvertSelection: () => void;
  onCropCanvasToSelection?: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
}

export const SelectSettingsPanel = memo(function SelectSettingsPanel({
  settings,
  onChange,
  hasActiveSelection,
  onInvertSelection,
  onCropCanvasToSelection,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onStrokeSelectionBorder
}: SelectSettingsPanelProps) {
  const [modifyPx, setModifyPx] = useState(1);
  const expandCurrentSelection = useSketchStore((s) => s.expandCurrentSelection);
  const contractCurrentSelection = useSketchStore(
    (s) => s.contractCurrentSelection
  );
  return (
    <>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={settings.mode}
        onChange={(_e, v: SelectToolMode | null) => {
          if (v != null) {
            onChange({ mode: v });
          }
        }}
      >
        <ToggleButton
          value="rectangle"
          sx={selectModeToggleButtonSx}
          aria-label="Rectangular marquee"
          title="Rectangular marquee"
        >
          <RectangleOutlinedIcon fontSize="inherit" />
        </ToggleButton>
        <ToggleButton
          value="ellipse"
          sx={selectModeToggleButtonSx}
          aria-label="Elliptical marquee"
          title="Elliptical marquee"
        >
          <RadioButtonUncheckedIcon fontSize="inherit" />
        </ToggleButton>
        <ToggleButton
          value="lasso"
          sx={selectModeToggleButtonSx}
          aria-label="Freehand lasso"
          title="Freehand (lasso)"
        >
          <GestureOutlinedIcon fontSize="inherit" />
        </ToggleButton>
        <ToggleButton
          value="lasso_polygon"
          sx={selectModeToggleButtonSx}
          aria-label="Polygon selection"
          title="Polygon"
        >
          <PentagonOutlinedIcon fontSize="inherit" />
        </ToggleButton>
        <ToggleButton
          value="magic_wand"
          sx={selectModeToggleButtonSx}
          aria-label="Magic wand"
          title="Magic wand (click to sample)"
        >
          <AutoAwesomeOutlinedIcon fontSize="inherit" />
        </ToggleButton>
      </ToggleButtonGroup>
      {settings.mode === "magic_wand" ? (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Tol.</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={255}
              value={settings.magicWandTolerance}
              onChange={(_, v) => onChange({ magicWandTolerance: v as number })}
            />
            <Typography className="setting-value">
              {settings.magicWandTolerance}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 0.5,
              flexWrap: "wrap",
              width: "100%"
            }}
          >
            <Button
              size="small"
              variant={settings.contiguous ? "contained" : "outlined"}
              onClick={() => onChange({ contiguous: !settings.contiguous })}
              sx={{ ...sketchButtonSmallSx, minWidth: "90px" }}
            >
              Contiguous
            </Button>
            <Button
              size="small"
              variant={settings.sampleAllLayers ? "contained" : "outlined"}
              onClick={() => onChange({ sampleAllLayers: !settings.sampleAllLayers })}
              sx={{ ...sketchButtonSmallSx, minWidth: "100px" }}
            >
              All Layers
            </Button>
          </Box>
        </>
      ) : null}
      <Box className="setting-row">
        <Typography className="setting-label">Feather</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={64}
          value={settings.featherRadius}
          onChange={(_, v) => onChange({ featherRadius: v as number })}
        />
        <Typography className="setting-value">
          {settings.featherRadius}
        </Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Border</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={64}
          value={settings.borderWidth}
          onChange={(_, v) => onChange({ borderWidth: v as number })}
        />
        <Typography className="setting-value">
          {settings.borderWidth}
        </Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Modify</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={64}
          value={modifyPx}
          onChange={(_, v) => setModifyPx(v as number)}
        />
        <Typography className="setting-value">{modifyPx}</Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.5,
          rowGap: 0.75,
          width: "100%"
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            flexWrap: "wrap",
            flex: 1,
            minWidth: 0
          }}
        >
          <Button
            size="small"
            variant="outlined"
            disabled={!hasActiveSelection}
            onClick={() => expandCurrentSelection(modifyPx)}
            sx={{ ...sketchButtonSmallSx, minWidth: "52px" }}
          >
            Grow
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!hasActiveSelection}
            onClick={() => contractCurrentSelection(modifyPx)}
            sx={{ ...sketchButtonSmallSx, minWidth: "52px" }}
          >
            Shrink
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={onInvertSelection}
            sx={{ ...sketchButtonSmallSx, minWidth: "52px" }}
          >
            Invert
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!hasActiveSelection}
            onClick={onFeatherSelection}
            sx={{ ...sketchButtonSmallSx, minWidth: "52px" }}
          >
            Feather
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!hasActiveSelection}
            onClick={onSmoothSelectionBorders}
            sx={{ ...sketchButtonSmallSx, minWidth: "52px" }}
          >
            Smooth
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!hasActiveSelection}
            onClick={onStrokeSelectionBorder}
            sx={{ ...sketchButtonSmallSx, minWidth: "52px" }}
          >
            Border
          </Button>
        </Box>
        {onCropCanvasToSelection ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flexShrink: 0,
              ml: "auto"
            }}
          >
            <Divider
              orientation="vertical"
              variant="middle"
              flexItem
              sx={{ alignSelf: "stretch", borderColor: "grey.700" }}
            />
            <Tooltip title="Crop canvas to selection" placement="top">
              <span>
                <IconButton
                  size="small"
                  disabled={!hasActiveSelection}
                  onClick={onCropCanvasToSelection}
                  aria-label="Crop canvas to selection"
                  sx={{
                    ...iconButtonCompactSx,
                    border: `1px solid ${SKETCH_COLORS.border}`,
                    borderRadius: 1,
                    color: SKETCH_COLORS.textSecondary
                  }}
                >
                  <CropIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ) : null}
      </Box>
    </>
  );
});
