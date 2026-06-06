import React, { memo } from "react";
import { Slider, Switch } from "@mui/material";
import { FlexRow, Box, Text } from "../../ui_primitives";
import { sketchSliderSx } from "../sketchStyles";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import {
  DEFAULT_PRESSURE_CURVE,
  DEFAULT_PRESSURE_MIN_SCALE,
  PenPressureSettings,
  pressureMinScaleFromSliderUnit,
  pressureMinScaleToSliderUnit
} from "../types";

interface PenPressureSettingsPanelProps {
  settings: PenPressureSettings;
  onChange: (settings: Partial<PenPressureSettings>) => void;
  /**
   * Hide the Pressure on/off switch (e.g. sketch modal header uses the stylus
   * icon as the only sensitivity toggle).
   */
  omitSensitivitySwitch?: boolean;
  /**
   * One horizontal strip: affects, then sliders left-to-right (tight chrome).
   */
  inlineRow?: boolean;
}

/** Global pen pressure (Brush/Pencil tool panels no longer duplicate these controls). */
export const PenPressureSettingsPanel = memo(function PenPressureSettingsPanel({
  settings,
  onChange,
  omitSensitivitySwitch = false,
  inlineRow = false
}: PenPressureSettingsPanelProps) {
  const affectsGroup = (
    <SketchModeToggle
      value={settings.pressureAffects || "both"}
      onChange={(_, v) => {
        if (v) {
          onChange({
            pressureAffects: v as "size" | "opacity" | "both"
          });
        }
      }}
    >
      <SketchModeOption value="size">Size</SketchModeOption>
      <SketchModeOption value="opacity">Opacity</SketchModeOption>
      <SketchModeOption value="both">Both</SketchModeOption>
    </SketchModeToggle>
  );

  const minScale = settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE;
  const lightEndSlider = Math.round(
    pressureMinScaleToSliderUnit(minScale) * 100
  );

  const lightEndRow = (
    <Box className="setting-row">
      <Text
        className="setting-label"
        title="Size/opacity at minimum pressure. Slider uses eased mapping so the upper range is easier to dial in."
      >
        Light end
      </Text>
      <Slider
        sx={sketchSliderSx}
        size="small"
        min={0}
        max={100}
        step={1}
        value={lightEndSlider}
        onChange={(_, v) =>
          onChange({
            pressureMinScale: pressureMinScaleFromSliderUnit(
              (v as number) / 100
            )
          })
        }
      />
      <Text className="setting-value">
        {Math.round(minScale * 100)}%
      </Text>
    </Box>
  );

  const curveRow = (
    <Box className="setting-row">
      <Text
        className="setting-label"
        title="Pressure exponent before mapping: 1 = linear; higher = need firmer pressure for full size"
      >
        Curve
      </Text>
      <Slider
        sx={sketchSliderSx}
        size="small"
        min={0.5}
        max={2.5}
        step={0.05}
        value={settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE}
        onChange={(_, v) => onChange({ pressureCurve: v as number })}
      />
      <Text className="setting-value">
        {(settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE).toFixed(2)}
      </Text>
    </Box>
  );

  const advancedBlock =
    settings.pressureSensitivity !== false ? (
      inlineRow ? (
        <FlexRow
          align="center"
          wrap
          sx={{
            columnGap: 8,
            rowGap: 4
          }}
        >
          {affectsGroup}
          {lightEndRow}
          {curveRow}
        </FlexRow>
      ) : (
        <Box sx={{ mb: "4px" }}>
          {affectsGroup}
          {lightEndRow}
          {curveRow}
        </Box>
      )
    ) : null;

  return (
    <>
      {!omitSensitivitySwitch ? (
        <Box className="setting-row" sx={{ alignItems: "center" }}>
          <Text className="setting-label">Pressure</Text>
          <Switch
            size="small"
            checked={settings.pressureSensitivity ?? true}
            onChange={(_, checked) =>
              onChange({ pressureSensitivity: checked })
            }
          />
        </Box>
      ) : null}
      {advancedBlock}
    </>
  );
});
