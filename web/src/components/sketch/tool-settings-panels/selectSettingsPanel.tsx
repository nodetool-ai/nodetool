import React, { memo, useRef, useState } from "react";
import { Slider } from "@mui/material";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CropIcon from "@mui/icons-material/Crop";
import GestureOutlinedIcon from "@mui/icons-material/GestureOutlined";
import PentagonOutlinedIcon from "@mui/icons-material/PentagonOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import OpacityIcon from "@mui/icons-material/Opacity";
import BorderStyleIcon from "@mui/icons-material/BorderStyle";
import {
  iconButtonCompactSx,
  sketchButtonSmallSx,
  sketchSliderSx,
  SKETCH_COLORS
} from "../sketchStyles";
import { SelectSettings, SelectToolMode } from "../types";
import {
  Divider,
  EditorButton,
  FlexRow,
  Text,
  ToolbarIconButton,
  Tooltip,
  Box
} from "../../ui_primitives";
import { RefineSelectionPopover } from "./refine-selection";
import { useSketchStore } from "../state";

interface SelectSettingsPanelProps {
  settings: SelectSettings;
  onChange: (settings: Partial<SelectSettings>) => void;
  hasActiveSelection: boolean;
  onInvertSelection: () => void;
  onCropCanvasToSelection?: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onConvertSelectionToBorder: () => void;
}

export const SelectSettingsPanel = memo(function SelectSettingsPanel({
  settings,
  onChange,
  hasActiveSelection,
  onInvertSelection,
  onCropCanvasToSelection,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onConvertSelectionToBorder
}: SelectSettingsPanelProps) {
  const refineAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const selectionPreviewMode = useSketchStore((s) => s.selectionPreviewMode);
  const setSelectionPreviewMode = useSketchStore(
    (s) => s.setSelectionPreviewMode
  );
  const showAsMask = selectionPreviewMode === "mask";

  return (
    <>
      <SketchModeToggle
        value={settings.mode}
        onChange={(_e, v: SelectToolMode | null) => {
          if (v != null) {
            onChange({ mode: v });
          }
        }}
      >
        <SketchModeOption
          value="rectangle"
          variant="icon"
          aria-label="Rectangular marquee"
          title="Rectangular marquee"
        >
          <RectangleOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="ellipse"
          variant="icon"
          aria-label="Elliptical marquee"
          title="Elliptical marquee"
        >
          <RadioButtonUncheckedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="lasso"
          variant="icon"
          aria-label="Freehand lasso"
          title="Freehand (lasso)"
        >
          <GestureOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="lasso_polygon"
          variant="icon"
          aria-label="Polygon selection"
          title="Polygon"
        >
          <PentagonOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="magic_wand"
          variant="icon"
          aria-label="Magic wand"
          title="Magic wand (click to sample)"
        >
          <AutoAwesomeOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
      </SketchModeToggle>

      {settings.mode === "magic_wand" ? (
        <>
          <Box className="setting-row">
            <Text className="setting-label">Tol.</Text>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={255}
              value={settings.magicWandTolerance}
              onChange={(_, v) => onChange({ magicWandTolerance: v as number })}
            />
            <Text className="setting-value">{settings.magicWandTolerance}</Text>
          </Box>
          <SketchModeToggle
            exclusive={false}
            value={[
              ...(settings.contiguous ? ["contiguous"] : []),
              ...(settings.sampleAllLayers ? ["allLayers"] : [])
            ]}
            onChange={(_, vals: string[]) => {
              onChange({
                contiguous: vals.includes("contiguous"),
                sampleAllLayers: vals.includes("allLayers")
              });
            }}
            sx={{ flexWrap: "wrap" }}
          >
            <SketchModeOption value="contiguous">Contiguous</SketchModeOption>
            <SketchModeOption value="allLayers">All Layers</SketchModeOption>
          </SketchModeToggle>
        </>
      ) : null}

      <FlexRow
        align="center"
        wrap
        gap={0.5}
        fullWidth
        sx={{
          rowGap: 1
        }}
      >
        <FlexRow
          align="center"
          wrap
          gap={1}
          sx={{
            flex: 1,
            minWidth: 0
          }}
        >
          <EditorButton
            variant="outlined"
            onClick={onInvertSelection}
            sx={{
              ...sketchButtonSmallSx,
              minWidth: "60px",
              height: 24,
              lineHeight: 1
            }}
          >
            Invert
          </EditorButton>
          <Tooltip title="Refine selection (grow, shrink, feather, smooth, border)">
            <span>
              <EditorButton
                ref={refineAnchorRef}
                variant="outlined"
                disabled={!hasActiveSelection}
                onClick={() => setRefineOpen(true)}
                startIcon={<TuneIcon sx={{ fontSize: 14 }} />}
                sx={{
                  ...sketchButtonSmallSx,
                  minWidth: "76px",
                  height: 24,
                  lineHeight: 1,
                  "& .MuiButton-startIcon": { mr: 0.5 }
                }}
              >
                Refine…
              </EditorButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              showAsMask
                ? "Showing selection as red overlay — click to switch to marching ants"
                : "Showing selection as marching ants — click to switch to red overlay"
            }
          >
            <span>
              <ToolbarIconButton
                onClick={() =>
                  setSelectionPreviewMode(showAsMask ? "ants" : "mask")
                }
                aria-label={
                  showAsMask
                    ? "Switch to marching ants"
                    : "Switch to mask overlay"
                }
                sx={{
                  ...iconButtonCompactSx,
                  border: `1px solid ${SKETCH_COLORS.border}`,
                  borderRadius: 1,
                  height: 24,
                  width: 24,
                  color: showAsMask
                    ? "error.light"
                    : SKETCH_COLORS.textSecondary
                }}
              >
                {showAsMask ? (
                  <OpacityIcon sx={{ fontSize: 16 }} />
                ) : (
                  <BorderStyleIcon sx={{ fontSize: 16 }} />
                )}
              </ToolbarIconButton>
            </span>
          </Tooltip>
        </FlexRow>
        {onCropCanvasToSelection ? (
          <FlexRow
            align="center"
            gap={0.75}
            sx={{
              flexShrink: 0,
              ml: "auto"
            }}
          >
            <Divider
              orientation="vertical"
              flexItem
              sx={{ alignSelf: "stretch", borderColor: "grey.700" }}
            />
            <Tooltip title="Crop canvas to selection">
              <span>
                <ToolbarIconButton
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
                </ToolbarIconButton>
              </span>
            </Tooltip>
          </FlexRow>
        ) : null}
      </FlexRow>

      <RefineSelectionPopover
        open={refineOpen}
        anchorEl={refineAnchorRef.current}
        onClose={() => setRefineOpen(false)}
        settings={settings}
        onChange={onChange}
        onFeatherSelection={onFeatherSelection}
        onSmoothSelectionBorders={onSmoothSelectionBorders}
        onConvertSelectionToBorder={onConvertSelectionToBorder}
      />
    </>
  );
});
