import { memo } from "react";
import { useTranslation } from "react-i18next";

import {
  FlexRow,
  Box,
  Text,
  Tooltip,
  EditorButton,
  ToolbarIconButton,
  SPACING,
  getSpacingPx,
  Checkbox,
  FormControlLabel,
  Slider,
  TYPOGRAPHY,
  ICON_SIZE
} from "../../ui_primitives";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  sketchButtonSmallSx,
  sketchHintTextSx,
  SKETCH_COLORS
} from "../sketchStyles";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import { TransformMode } from "../types";
import { getToolbarTransformModes } from "../transform/modes";

interface AdjustmentsSettingsPanelProps {
  brightness: number;
  contrast: number;
  saturation: number;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export const AdjustmentsSettingsPanel = memo(function AdjustmentsSettingsPanel({
  brightness,
  contrast,
  saturation,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onApply,
  onCancel
}: AdjustmentsSettingsPanelProps) {
  const { t } = useTranslation();
  const hasChanges = brightness !== 0 || contrast !== 0 || saturation !== 0;
  return (
    <>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.adjustments.brightness")}</Text>
        <Slider
          size="small"
          min={-100}
          max={100}
          value={brightness}
          onChange={(_, v) => onBrightnessChange(v as number)}
        />
        <Text className="setting-value">{brightness}</Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.adjustments.contrast")}</Text>
        <Slider
          size="small"
          min={-100}
          max={100}
          value={contrast}
          onChange={(_, v) => onContrastChange(v as number)}
        />
        <Text className="setting-value">{contrast}</Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.adjustments.saturation")}</Text>
        <Slider
          size="small"
          min={-100}
          max={100}
          value={saturation}
          onChange={(_, v) => onSaturationChange(v as number)}
        />
        <Text className="setting-value">{saturation}</Text>
      </Box>
      <FlexRow gap={0.5}>
        <EditorButton
          size="small"
          variant="outlined"
          color="primary"
          disabled={!hasChanges}
          onClick={onApply}
          sx={{ ...sketchButtonSmallSx, flex: 1 }}
        >
          {t("i18n-next13.sketch.actions.apply")}
        </EditorButton>
        <EditorButton
          size="small"
          variant="text"
          color="inherit"
          disabled={!hasChanges}
          onClick={onCancel}
          sx={{ ...sketchButtonSmallSx, flex: 1 }}
        >
          {t("i18n-next13.sketch.actions.cancel")}
        </EditorButton>
      </FlexRow>
    </>
  );
});

interface MoveSettingsPanelProps {
  autoSelect: boolean;
  onAutoSelectChange: (enabled: boolean) => void;
}

export const MoveSettingsPanel = memo(function MoveSettingsPanel({
  autoSelect,
  onAutoSelectChange
}: MoveSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={autoSelect}
          onChange={(e) => onAutoSelectChange(e.target.checked)}
          size="small"
          sx={{ padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}` }}
        />
      }
      label={
        <Text
          sx={{ ...TYPOGRAPHY.sans.label, userSelect: "none" }}
        >
          {t("i18n-next13.sketch.transform.autoSelect")}
        </Text>
      }
      sx={{ mr: 2, ml: 0 }}
    />
  );
});

interface TransformSettingsPanelProps {
  scaleX: number;
  scaleY: number;
  rotation: number;
  autoSelect: boolean;
  mode: TransformMode;
  onAutoSelectChange: (enabled: boolean) => void;
  onModeChange: (mode: TransformMode) => void;
  onCommit: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export const TransformSettingsPanel = memo(function TransformSettingsPanel({
  scaleX,
  scaleY,
  rotation,
  autoSelect,
  mode,
  onAutoSelectChange,
  onModeChange,
  onCommit,
  onCancel,
  onReset
}: TransformSettingsPanelProps) {
  const { t } = useTranslation();
  const rotDeg = Math.round(((rotation * 180) / Math.PI) * 10) / 10;
  return (
    <>
      <FormControlLabel
        control={
          <Checkbox
            checked={autoSelect}
            onChange={(e) => onAutoSelectChange(e.target.checked)}
            size="small"
            sx={{ padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}` }}
          />
        }
        label={
          <Text
            sx={{ ...TYPOGRAPHY.sans.label, userSelect: "none" }}
          >
            {t("i18n-next13.sketch.transform.autoSelect")}
          </Text>
        }
        sx={{ mr: 2, ml: 0 }}
      />
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.transform.mode")}</Text>
        <SketchModeToggle
          value={mode}
          onChange={(_, nextMode: TransformMode | null) => {
            if (nextMode) {
              onModeChange(nextMode);
            }
          }}
        >
          {getToolbarTransformModes().map((modeHandler) => {
            const modeLabel = t(`i18n-next13.sketch.transform.modes.${modeHandler.id}`);
            const modeTooltip = modeHandler.id === "distort"
              ? t("i18n-next13.sketch.transform.modeTooltips.distort")
              : modeHandler.id === "perspective"
                ? t("i18n-next13.sketch.transform.modeTooltips.perspective")
                : undefined;
            const button = (
              <SketchModeOption key={modeHandler.id} value={modeHandler.id}>
                {modeLabel}
              </SketchModeOption>
            );
            return modeTooltip ? (
              <Tooltip key={modeHandler.id} title={modeTooltip}>
                {button}
              </Tooltip>
            ) : (
              button
            );
          })}
        </SketchModeToggle>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.transform.scaleX")}</Text>
        <Text className="setting-value">
          {(scaleX * 100).toFixed(0)}%
        </Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.transform.scaleY")}</Text>
        <Text className="setting-value">
          {(scaleY * 100).toFixed(0)}%
        </Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">{t("i18n-next13.sketch.transform.rotation")}</Text>
        <Text className="setting-value">{rotDeg}°</Text>
      </Box>
      <FlexRow sx={{ gap: getSpacingPx(SPACING.micro), ml: 1 }}>
        <ToolbarIconButton
          icon={<CheckIcon sx={{ fontSize: ICON_SIZE.md }} />}
          tooltip={t("i18n-next13.sketch.actions.commit")}
          shortcut={["Enter"]}
          tooltipPlacement="bottom"
          onClick={onCommit}
          sx={{ padding: 1, color: "success.main" }}
        />
        <ToolbarIconButton
          icon={<CloseIcon sx={{ fontSize: ICON_SIZE.md }} />}
          tooltip={t("i18n-next13.sketch.actions.cancel")}
          shortcut={["Esc"]}
          tooltipPlacement="bottom"
          onClick={onCancel}
          sx={{ padding: 1, color: "error.main" }}
        />
        <ToolbarIconButton
          icon={<RestartAltIcon sx={{ fontSize: ICON_SIZE.md }} />}
          tooltip={t("i18n-next13.sketch.actions.reset")}
          tooltipPlacement="bottom"
          onClick={onReset}
          sx={{ padding: 1, color: SKETCH_COLORS.textSecondary }}
        />
      </FlexRow>
    </>
  );
});

export const NoSettingsMessage = memo(function NoSettingsMessage() {
  const { t } = useTranslation();
  return (
    <Text sx={{ ...sketchHintTextSx }}>
      {t("i18n-next102.sketch.toolSettings.noSettings")}
    </Text>
  );
});

export const CropSettingsPanel = memo(function CropSettingsPanel({
  hasPendingCrop,
  onApply,
  onCancel
}: {
  hasPendingCrop: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Text sx={{ ...sketchHintTextSx }}>
        {t("i18n-next102.sketch.toolSettings.cropInstructions")}
      </Text>
      <FlexRow sx={{ gap: getSpacingPx(SPACING.micro), ml: 1 }}>
        <ToolbarIconButton
          icon={<CheckIcon sx={{ fontSize: ICON_SIZE.md }} />}
          tooltip={t("i18n-next102.sketch.toolSettings.applyCrop")}
          shortcut={["Enter"]}
          tooltipPlacement="bottom"
          disabled={!hasPendingCrop}
          onClick={onApply}
          sx={{ padding: 1, color: "success.main" }}
        />
        <ToolbarIconButton
          icon={<CloseIcon sx={{ fontSize: ICON_SIZE.md }} />}
          tooltip={t("i18n-next102.sketch.toolSettings.cancelCropPreview")}
          shortcut={["Esc"]}
          tooltipPlacement="bottom"
          disabled={!hasPendingCrop}
          onClick={onCancel}
          sx={{ padding: 1, color: "error.main" }}
        />
      </FlexRow>
    </>
  );
});
