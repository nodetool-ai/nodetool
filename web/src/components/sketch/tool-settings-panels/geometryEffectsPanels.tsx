import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Text,
  SPACING,
  getSpacingPx,
  Checkbox,
  FormControlLabel,
  Slider,
  activateOnKey,
  FONT_SIZE_SANS
} from "../../ui_primitives";
import {
  BlurSettings,
  CloneStampSampling,
  CloneStampSettings,
  colorToHex6,
  FillSettings,
  GradientSettings,
  mergeRgbHexIntoColor,
  ShapeSettings,
  ShapeToolType
} from "../types";
import { colorSwatchSx, sketchHintTextSx } from "../sketchStyles";
import ColorPickerPopover from "../ColorPickerPopover";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";

interface ShapeSettingsPanelProps {
  settings: ShapeSettings;
  onChange: (settings: Partial<ShapeSettings>) => void;
}

interface FillSettingsPanelProps {
  settings: FillSettings;
  onChange: (settings: Partial<FillSettings>) => void;
}

interface BlurSettingsPanelProps {
  settings: BlurSettings;
  onChange: (settings: Partial<BlurSettings>) => void;
}

interface GradientSettingsPanelProps {
  settings: GradientSettings;
  onChange: (settings: Partial<GradientSettings>) => void;
}

interface CloneStampSettingsPanelProps {
  settings: CloneStampSettings;
  onChange: (settings: Partial<CloneStampSettings>) => void;
}

const SHAPE_TYPES: { value: ShapeToolType; labelKey: string }[] = [
  { value: "line", labelKey: "line" },
  { value: "rectangle", labelKey: "rect" },
  { value: "ellipse", labelKey: "ellipse" },
  { value: "arrow", labelKey: "arrow" }
];

export const ShapeSettingsPanel = memo(function ShapeSettingsPanel({
  settings,
  onChange
}: ShapeSettingsPanelProps) {
  const { t } = useTranslation();
  const canFill =
    settings.shapeType === "rectangle" || settings.shapeType === "ellipse";
  return (
    <>
      <SketchModeToggle
        value={settings.shapeType ?? "rectangle"}
        onChange={(_, v) => {
          if (v) {
            onChange({ shapeType: v as ShapeToolType });
          }
        }}
        sx={{ mb: getSpacingPx(SPACING.xs) }}
      >
        {SHAPE_TYPES.map(({ value, labelKey }) => (
          <SketchModeOption key={value} value={value}>
            {t(`i18n-cont-sketch-tools-08.geometry.${labelKey}`)}
          </SketchModeOption>
        ))}
      </SketchModeToggle>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.stroke")}</Text>
        <input
          type="color"
          className="color-input"
          aria-label={t("i18n-cont-sketch-tools-08.geometry.strokeColor")}
          value={colorToHex6(settings.strokeColor)}
          onChange={(e) =>
            onChange({
              strokeColor: mergeRgbHexIntoColor(
                e.target.value,
                settings.strokeColor
              )
            })
          }
        />
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.width")}</Text>
        <Slider
          size="small"
          min={1}
          max={50}
          value={settings.strokeWidth}
          onChange={(_, v) => onChange({ strokeWidth: v as number })}
        />
        <Text className="setting-value">
          {settings.strokeWidth}
        </Text>
      </Box>
      {canFill && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={settings.filled}
                onChange={(e) => onChange({ filled: e.target.checked })}
              />
            }
            label={
              <Text sx={{ fontSize: FONT_SIZE_SANS.label }}>{t("i18n-cont-sketch-tools-08.geometry.fill")}</Text>
            }
          />
          {settings.filled && (
            <Box className="setting-row">
              <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.fill")}</Text>
              <input
                type="color"
                className="color-input"
                aria-label={t("i18n-cont-sketch-tools-08.geometry.fillColor")}
                value={colorToHex6(settings.fillColor)}
                onChange={(e) =>
                  onChange({
                    fillColor: mergeRgbHexIntoColor(
                      e.target.value,
                      settings.fillColor
                    )
                  })
                }
              />
            </Box>
          )}
        </>
      )}
    </>
  );
});

export const FillSettingsPanel = memo(function FillSettingsPanel({
  settings,
  onChange
}: FillSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <Box className="setting-row">
      <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.tolerance")}</Text>
      <Slider
        size="small"
        min={0}
        max={128}
        value={settings.tolerance}
        onChange={(_, v) => onChange({ tolerance: v as number })}
      />
      <Text className="setting-value">{settings.tolerance}</Text>
    </Box>
  );
});

export const BlurSettingsPanel = memo(function BlurSettingsPanel({
  settings,
  onChange
}: BlurSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.size")}</Text>
        <Slider
          size="small"
          min={1}
          max={200}
          value={settings.size}
          onChange={(_, v) => onChange({ size: v as number })}
        />
        <Text className="setting-value">{settings.size}</Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.strength")}</Text>
        <Slider
          size="small"
          min={1}
          max={20}
          value={settings.strength}
          onChange={(_, v) => onChange({ strength: v as number })}
        />
        <Text className="setting-value">{settings.strength}</Text>
      </Box>
    </>
  );
});

export const GradientSettingsPanel = memo(function GradientSettingsPanel({
  settings,
  onChange
}: GradientSettingsPanelProps) {
  const { t } = useTranslation();
  const [startAnchor, setStartAnchor] = useState<HTMLElement | null>(null);
  const [endAnchor, setEndAnchor] = useState<HTMLElement | null>(null);
  const [startInitial, setStartInitial] = useState(settings.startColor);
  const [endInitial, setEndInitial] = useState(settings.endColor);

  return (
    <>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.start")}</Text>
        <Box
          sx={{ ...colorSwatchSx }}
          role="button"
          tabIndex={0}
          aria-label={t("i18n-cont-sketch-tools-08.geometry.gradientStartColor")}
          aria-haspopup="dialog"
          onClick={(e) => {
            setStartInitial(settings.startColor);
            setStartAnchor(e.currentTarget);
          }}
          onKeyDown={activateOnKey<HTMLDivElement>((e) => {
            setStartInitial(settings.startColor);
            setStartAnchor(e.currentTarget);
          })}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundColor: settings.startColor
            }}
          />
        </Box>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.end")}</Text>
        <Box
          sx={{ ...colorSwatchSx }}
          role="button"
          tabIndex={0}
          aria-label={t("i18n-cont-sketch-tools-08.geometry.gradientEndColor")}
          aria-haspopup="dialog"
          onClick={(e) => {
            setEndInitial(settings.endColor);
            setEndAnchor(e.currentTarget);
          }}
          onKeyDown={activateOnKey<HTMLDivElement>((e) => {
            setEndInitial(settings.endColor);
            setEndAnchor(e.currentTarget);
          })}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundColor: settings.endColor
            }}
          />
        </Box>
      </Box>
      <SketchModeToggle
        value={settings.type}
        onChange={(_, v) => {
          if (v) {
            onChange({ type: v });
          }
        }}
      >
        <SketchModeOption value="linear">{t("i18n-cont-sketch-tools-08.geometry.linear")}</SketchModeOption>
        <SketchModeOption value="radial">{t("i18n-cont-sketch-tools-08.geometry.radial")}</SketchModeOption>
      </SketchModeToggle>

      <ColorPickerPopover
        anchorEl={startAnchor}
        color={settings.startColor}
        initialColor={startInitial}
        onColorChange={(c) => onChange({ startColor: c })}
        onClose={() => setStartAnchor(null)}
      />
      <ColorPickerPopover
        anchorEl={endAnchor}
        color={settings.endColor}
        initialColor={endInitial}
        onColorChange={(c) => onChange({ endColor: c })}
        onClose={() => setEndAnchor(null)}
      />
    </>
  );
});

export const CloneStampSettingsPanel = memo(function CloneStampSettingsPanel({
  settings,
  onChange
}: CloneStampSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.size")}</Text>
        <Slider
          size="small"
          min={1}
          max={200}
          value={settings.size}
          onChange={(_, v) => onChange({ size: v as number })}
        />
        <Text className="setting-value">{settings.size}</Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.opacity")}</Text>
        <Slider
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.opacity}
          onChange={(_, v) => onChange({ opacity: v as number })}
        />
        <Text className="setting-value">
          {Math.round(settings.opacity * 100)}%
        </Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-cont-sketch-tools-08.geometry.hardness")}</Text>
        <Slider
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.hardness}
          onChange={(_, v) => onChange({ hardness: v as number })}
        />
        <Text className="setting-value">
          {Math.round(settings.hardness * 100)}%
        </Text>
      </Box>
      <SketchModeToggle
        value={settings.sampling}
        onChange={(_, v) => {
          if (v) {
            onChange({ sampling: v as CloneStampSampling });
          }
        }}
      >
        <SketchModeOption value="active_layer">{t("i18n-cont-sketch-tools-08.geometry.activeLayer")}</SketchModeOption>
        <SketchModeOption value="composited">{t("i18n-cont-sketch-tools-08.geometry.allLayers")}</SketchModeOption>
      </SketchModeToggle>
      <Text sx={{ ...sketchHintTextSx, mt: 1 }}>
        {t("i18n-cont-sketch-tools-08.geometry.setSourcePointHint")}
      </Text>
    </>
  );
});
