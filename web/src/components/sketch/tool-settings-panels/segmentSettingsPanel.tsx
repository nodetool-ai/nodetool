import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import {
  SegmentationStatus,
  SegmentPromptMode,
  SegmentSettings,
  SegmentSourceLayerAction
} from "../types";
import type { SamModelInfo } from "../sam";
import {
  FlexRow,
  TextInput,
  Box,
  Text,
  TYPOGRAPHY,
  FormControlLabel,
  Slider,
  Switch
} from "../../ui_primitives";
import { EditorButton } from "../../editor_ui";
import {
  sketchButtonSmallSx,
  SKETCH_COLORS
} from "../sketchStyles";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import { useSketchStore } from "../state";
import { getLayerDataImageUrl } from "../serialization";

function promptModeHelpKey(mode: SegmentPromptMode): string {
  if (mode === "point") {
    return "pointHelp";
  }
  if (mode === "box") {
    return "boxHelp";
  }
  return "autoHelp";
}

function segmentationStatusMessageKey(status: SegmentationStatus): string {
  switch (status) {
    case "checking-model":
      return "checkingModel";
    case "encoding":
      return "encodingImage";
    case "inferring":
      return "segmenting";
    default:
      return "processing";
  }
}

interface SegmentSettingsPanelProps {
  settings: SegmentSettings;
  onChange: (settings: Partial<SegmentSettings>) => void;
  segmentationStatus: SegmentationStatus;
  /** What went wrong, when the status is "error". */
  segmentationError: string | null;
  modelInfo: SamModelInfo | null;
  onRunSegmentation: () => void;
  onApplyResult: () => void;
  onDiscardResult: () => void;
  onCancelSegmentation: () => void;
  onClearPrompts: () => void;
  onCheckModel: () => void;
}

export const SegmentSettingsPanel = memo(function SegmentSettingsPanel({
  settings,
  onChange,
  segmentationStatus,
  segmentationError,
  modelInfo,
  onRunSegmentation,
  onApplyResult,
  onDiscardResult,
  onCancelSegmentation,
  onClearPrompts,
  onCheckModel
}: SegmentSettingsPanelProps) {
  const { t } = useTranslation();
  const isRunning =
    segmentationStatus === "inferring" ||
    segmentationStatus === "encoding" ||
    segmentationStatus === "checking-model";
  const isPreviewing = segmentationStatus === "previewing";
  const canSplitSelectedLayer = useSketchStore((state) => {
    const selectedLayerIds =
      state.selectedLayerIds.length > 0
        ? state.selectedLayerIds
        : [state.document.activeLayerId];
    if (selectedLayerIds.length !== 1) {
      return false;
    }
    const selectedLayer = state.document.layers.find(
      (layer) => layer.id === selectedLayerIds[0]
    );
    if (selectedLayer?.type !== "raster") {
      return false;
    }
    // A layer imported from an asset renders from its `imageReference` and
    // carries no `data` until something paints on it — still splittable.
    return (
      !!getLayerDataImageUrl(selectedLayer.data) ||
      !!selectedLayer.imageReference?.uri
    );
  });
  const modelReady = modelInfo?.status === "available";
  const canRunSegmentation =
    modelReady &&
    (settings.promptMode === "auto" ? canSplitSelectedLayer : true);
  const segmentActionLabel =
    settings.promptMode === "auto"
      ? t("i18n-cont-sketch-tools-08.segment.splitSelectedLayer")
      : t("i18n-cont-sketch-tools-08.segment.segment");
  const showClearPrompts = settings.promptMode !== "auto";
  // The picker names the model, so its status line is only worth a row when
  // the model cannot run.
  const showModelStatus = modelInfo !== null && !modelReady;

  const handleModelChange = useCallback(
    (value: ImageModelValue) => {
      if (!value.provider || !value.id) {
        return;
      }
      onChange({
        model: {
          provider: value.provider,
          id: value.id,
          name: value.name || value.id
        }
      });
      onCheckModel();
    },
    [onChange, onCheckModel]
  );

  return (
    <>
      {/* What runs, and how the user points at the object. */}
      <Box className="setting-group">
        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.model")}</Text>
          {/* The picker's button is `width: 100%`, so it needs a box to fill
              — left free it stretched to a third of the bar. */}
          <Box sx={{ width: 192, flexShrink: 0 }}>
            <ImageModelSelect
              task="segment"
              // With nothing picked the run uses the shipped default, so name
              // it rather than showing an empty picker.
              value={settings.model?.id ?? modelInfo?.modelId ?? ""}
              provider={settings.model?.provider}
              onChange={handleModelChange}
            />
          </Box>
          {showModelStatus && (
            <Text
              sx={{
                ...TYPOGRAPHY.sans.caption,
                whiteSpace: "nowrap",
                color:
                  modelInfo.status === "error" ||
                  modelInfo.status === "not-installed"
                    ? "warning.main"
                    : SKETCH_COLORS.textFaint
              }}
            >
              {modelInfo.status === "not-installed" &&
                (modelInfo.errorMessage ?? t("i18n-cont-sketch-tools-08.segment.modelNotAvailable"))}
              {modelInfo.status === "error" &&
                (modelInfo.errorMessage ?? t("i18n-cont-sketch-tools-08.segment.connectionFailed"))}
              {modelInfo.status === "checking" && t("i18n-cont-sketch-tools-08.segment.checking")}
            </Text>
          )}
        </Box>

        <SketchModeToggle
          value={settings.promptMode}
          onChange={(_, v) => {
            if (v) {
              onChange({ promptMode: v as SegmentPromptMode });
            }
          }}
        >
          <SketchModeOption value="point">{t("i18n-cont-sketch-tools-08.segment.point")}</SketchModeOption>
          <SketchModeOption value="box">{t("i18n-cont-sketch-tools-08.segment.box")}</SketchModeOption>
          <SketchModeOption value="auto">{t("i18n-cont-sketch-tools-08.segment.auto")}</SketchModeOption>
        </SketchModeToggle>
      </Box>

      {/* What counts as an object. */}
      <Box className="setting-group">
        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.maxObjects")}</Text>
          <Slider
            size="small"
            min={1}
            max={20}
            value={settings.maxObjects}
            onChange={(_, v) => onChange({ maxObjects: v as number })}
          />
          <Text className="setting-value">{settings.maxObjects}</Text>
        </Box>

        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.confidence")}</Text>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.05}
            value={settings.confidenceThreshold}
            onChange={(_, v) => onChange({ confidenceThreshold: v as number })}
          />
          <Text className="setting-value">
            {settings.confidenceThreshold.toFixed(2)}
          </Text>
        </Box>

        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.minSize")}</Text>
          <Slider
            size="small"
            min={0}
            max={10000}
            step={100}
            value={settings.minObjectSize}
            onChange={(_, v) => onChange({ minObjectSize: v as number })}
          />
          <Text className="setting-value">{settings.minObjectSize}</Text>
        </Box>

        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.feather")}</Text>
          <Slider
            size="small"
            min={0}
            max={20}
            step={1}
            value={settings.maskFeather}
            onChange={(_, v) => onChange({ maskFeather: v as number })}
          />
          <Text className="setting-value">{settings.maskFeather}</Text>
        </Box>
      </Box>

      {/* What the run leaves behind. */}
      <Box className="setting-group">
        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.sourceLayer")}</Text>
          <SketchModeToggle
            value={settings.sourceLayerAction}
            onChange={(_, v) => {
              if (v) {
                onChange({ sourceLayerAction: v as SegmentSourceLayerAction });
              }
            }}
          >
            <SketchModeOption value="keep">{t("i18n-cont-sketch-tools-08.segment.keep")}</SketchModeOption>
            <SketchModeOption value="hide">{t("i18n-cont-sketch-tools-08.segment.hide")}</SketchModeOption>
            <SketchModeOption value="lock">{t("i18n-cont-sketch-tools-08.segment.lock")}</SketchModeOption>
          </SketchModeToggle>
        </Box>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.outputCutouts}
              onChange={(e) => onChange({ outputCutouts: e.target.checked })}
            />
          }
          label={
            <Text sx={{ ...TYPOGRAPHY.sans.label }}>
              {settings.outputCutouts
                ? t("i18n-cont-sketch-tools-08.segment.cutoutLayers")
                : t("i18n-cont-sketch-tools-08.segment.maskLayers")}
            </Text>
          }
          sx={{ ml: 0, mr: 0 }}
        />
      </Box>

      <Box className="setting-group">
        <Box className="setting-row">
          <Text className="setting-label">{t("i18n-cont-sketch-tools-08.segment.concept")}</Text>
          <TextInput
            compact
            value={settings.conceptPrompt}
            onChange={(event) =>
              onChange({ conceptPrompt: event.target.value })
            }
            placeholder={t("i18n-cont-sketch-tools-08.segment.describeObject")}
            inputProps={{ "aria-label": t("i18n-cont-sketch-tools-08.segment.conceptPrompt") }}
            // Wide enough for the placeholder to read in full, and it keeps
            // the bar from being dominated by one text field.
            sx={{ width: 200 }}
          />
        </Box>
      </Box>

      <FlexRow className="setting-group" gap={0.5} sx={{ flexShrink: 0 }}>
        {!isRunning && !isPreviewing && (
          <>
            <EditorButton
              size="small"
              variant="contained"
              onClick={onRunSegmentation}
              disabled={!canRunSegmentation}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              {segmentActionLabel}
            </EditorButton>
            {showClearPrompts && (
              <EditorButton
                size="small"
                variant="text"
                onClick={onClearPrompts}
                sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
              >
                {t("i18n-cont-sketch-tools-08.segment.clear")}
              </EditorButton>
            )}
          </>
        )}
        {isRunning && (
          <>
            <Text
              sx={{
                ...TYPOGRAPHY.sans.label,
                color: "info.main"
              }}
            >
              {t(`i18n-cont-sketch-tools-08.segment.${segmentationStatusMessageKey(segmentationStatus)}`)}
            </Text>
            <EditorButton
              size="small"
              variant="text"
              color="inherit"
              onClick={onCancelSegmentation}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              {t("i18n-cont-sketch-tools-08.segment.cancel")}
            </EditorButton>
          </>
        )}
        {isPreviewing && (
          <>
            <EditorButton
              size="small"
              variant="contained"
              color="success"
              onClick={onApplyResult}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              {t("i18n-cont-sketch-tools-08.segment.apply")}
            </EditorButton>
            <EditorButton
              size="small"
              variant="text"
              onClick={onDiscardResult}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              {t("i18n-cont-sketch-tools-08.segment.discard")}
            </EditorButton>
          </>
        )}
        {/* The hint belongs beside the button it explains, not on a line of
            its own at the far end of a wrapped bar. A run in flight says what
            it is doing instead. */}
        {!isRunning && !isPreviewing && (
          <Text
            sx={{
              ...TYPOGRAPHY.sans.caption,
              color: SKETCH_COLORS.textFaint,
              maxWidth: 320
            }}
          >
            {settings.promptMode === "auto" && !canSplitSelectedLayer
              ? t("i18n-cont-sketch-tools-08.segment.selectOneRasterLayer")
              : t(`i18n-cont-sketch-tools-08.segment.${promptModeHelpKey(settings.promptMode)}`)}
          </Text>
        )}
      </FlexRow>

      {segmentationError !== null && (
        <Text
          className="setting-group"
          sx={{
            ...TYPOGRAPHY.sans.caption,
            // A run that found nothing is a result, not a failure.
            color:
              segmentationStatus === "error"
                ? "error.main"
                : SKETCH_COLORS.textFaint,
            maxWidth: 520,
            // The provider's own message names the model, the credential or
            // the argument it refused — worth every character.
            wordBreak: "break-word"
          }}
        >
          {segmentationError ?? t("i18n-cont-sketch-tools-08.segment.segmentationFailed")}
        </Text>
      )}
    </>
  );
});
