import { memo, useCallback, useEffect } from "react";

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
  SPACING,
  getSpacingPx,
  FormControlLabel,
  Slider,
  Switch
} from "../../ui_primitives";
import { EditorButton } from "../../editor_ui";
import {
  sketchButtonSmallSx,
  sketchSliderSx,
  SKETCH_COLORS,
  SKETCH_FONT
} from "../sketchStyles";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import { useSketchStore } from "../state";
import { getLayerDataImageUrl } from "../serialization";

function promptModeHelpText(mode: SegmentPromptMode): string {
  if (mode === "point") {
    return "Click: include · Alt+click: exclude";
  }
  if (mode === "box") {
    return "Drag to draw a bounding box";
  }
  return "Finds what Concept names; some models find objects on their own";
}

function getSegmentationStatusMessage(status: SegmentationStatus): string {
  switch (status) {
    case "checking-model":
      return "Checking model…";
    case "encoding":
      return "Encoding image…";
    case "inferring":
      return "Segmenting…";
    default:
      return "Processing…";
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
    settings.promptMode === "auto" ? "Split selected layer" : "Segment";
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
      <Box
        className="setting-row"
        sx={{ gap: getSpacingPx(SPACING.xs), minWidth: 220 }}
      >
        <Text className="setting-label">Model</Text>
        <ImageModelSelect
          task="segment"
          // With nothing picked the run uses the shipped default, so name it
          // rather than showing an empty picker.
          value={settings.model?.id ?? modelInfo?.modelId ?? ""}
          onChange={handleModelChange}
        />
      </Box>

      {showModelStatus && (
        <Box sx={{ mb: getSpacingPx(SPACING.xs) }}>
          <Text
            sx={{
              fontSize: SKETCH_FONT.xs,
              lineHeight: 1.3,
              color:
                modelInfo.status === "error" ||
                modelInfo.status === "not-installed"
                  ? "warning.main"
                  : SKETCH_COLORS.textFaint
            }}
          >
            {modelInfo.status === "not-installed" &&
              (modelInfo.errorMessage ?? "Model not available")}
            {modelInfo.status === "error" &&
              (modelInfo.errorMessage ?? "Connection failed")}
            {modelInfo.status === "checking" && "Checking…"}
          </Text>
        </Box>
      )}

      <SketchModeToggle
        value={settings.promptMode}
        onChange={(_, v) => {
          if (v) {
            onChange({ promptMode: v as SegmentPromptMode });
          }
        }}
        sx={{ mb: getSpacingPx(SPACING.xs) }}
      >
        <SketchModeOption value="point">Point</SketchModeOption>
        <SketchModeOption value="box">Box</SketchModeOption>
        <SketchModeOption value="auto">Auto</SketchModeOption>
      </SketchModeToggle>

      <Box className="setting-row">
        <Text className="setting-label">Max Objects</Text>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={20}
          value={settings.maxObjects}
          onChange={(_, v) => onChange({ maxObjects: v as number })}
        />
        <Text className="setting-value">{settings.maxObjects}</Text>
      </Box>

      <Box className="setting-row">
        <Text className="setting-label">Confidence</Text>
        <Slider
          sx={sketchSliderSx}
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
        <Text className="setting-label">Min Size</Text>
        <Slider
          sx={sketchSliderSx}
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
        <Text className="setting-label">Feather</Text>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={20}
          step={1}
          value={settings.maskFeather}
          onChange={(_, v) => onChange({ maskFeather: v as number })}
        />
        <Text className="setting-value">{settings.maskFeather}</Text>
      </Box>

      <Box className="setting-row" sx={{ gap: getSpacingPx(SPACING.xs) }}>
        <Text className="setting-label">Source Layer</Text>
        <SketchModeToggle
          value={settings.sourceLayerAction}
          onChange={(_, v) => {
            if (v) {
              onChange({ sourceLayerAction: v as SegmentSourceLayerAction });
            }
          }}
        >
          <SketchModeOption value="keep">Keep</SketchModeOption>
          <SketchModeOption value="hide">Hide</SketchModeOption>
          <SketchModeOption value="lock">Lock</SketchModeOption>
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
          <Text sx={{ fontSize: SKETCH_FONT.xs }}>
            {settings.outputCutouts ? "Cutout layers" : "Mask layers"}
          </Text>
        }
        sx={{ mt: getSpacingPx(SPACING.micro), ml: 0 }}
      />

      <Box className="setting-row" sx={{ alignItems: "flex-start" }}>
          <Text className="setting-label" sx={{ pt: getSpacingPx(SPACING.sm) }}>
            Concept
          </Text>
          <TextInput
            compact
            value={settings.conceptPrompt}
            onChange={(event) =>
              onChange({ conceptPrompt: event.target.value })
            }
            placeholder="Describe the object to isolate"
            fullWidth
            inputProps={{ "aria-label": "Concept prompt" }}
            sx={{
              flex: 1,
              "& .MuiInputBase-root": {
                fontSize: SKETCH_FONT.xs
              }
            }}
          />
      </Box>

      <FlexRow wrap gap={0.5} sx={{ mt: getSpacingPx(SPACING.xs) }}>
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
                variant="outlined"
                onClick={onClearPrompts}
                sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
              >
                Clear
              </EditorButton>
            )}
          </>
        )}
        {isRunning && (
          <>
            <Text
              sx={{
                fontSize: SKETCH_FONT.xs,
                color: "info.main",
                lineHeight: 1.3,
                mr: 0.5,
                display: "flex",
                alignItems: "center"
              }}
            >
              {getSegmentationStatusMessage(segmentationStatus)}
            </Text>
            <EditorButton
              size="small"
              variant="outlined"
              color="warning"
              onClick={onCancelSegmentation}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Cancel
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
              Apply
            </EditorButton>
            <EditorButton
              size="small"
              variant="outlined"
              onClick={onDiscardResult}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Discard
            </EditorButton>
          </>
        )}
      </FlexRow>

      <Text
        sx={{
          fontSize: SKETCH_FONT.xs,
          color: SKETCH_COLORS.textFaint,
          lineHeight: 1.3,
          maxWidth: 320,
          mt: getSpacingPx(SPACING.xs)
        }}
      >
        {promptModeHelpText(settings.promptMode)}
      </Text>

      {settings.promptMode === "auto" && !canSplitSelectedLayer && (
        <Text
          sx={{
            fontSize: SKETCH_FONT.xs,
            color: SKETCH_COLORS.textFaint,
            lineHeight: 1.3,
            mt: getSpacingPx(SPACING.micro)
          }}
        >
          Select exactly one raster layer to split.
        </Text>
      )}

      {segmentationError !== null && (
        <Text
          sx={{
            fontSize: SKETCH_FONT.xs,
            // A run that found nothing is a result, not a failure.
            color:
              segmentationStatus === "error"
                ? "error.main"
                : SKETCH_COLORS.textFaint,
            lineHeight: 1.3,
            mt: getSpacingPx(SPACING.micro),
            maxWidth: 520,
            // The provider's own message names the model, the credential or
            // the argument it refused — worth every character.
            wordBreak: "break-word"
          }}
        >
          {segmentationError ?? "Segmentation failed."}
        </Text>
      )}
    </>
  );
});
