import React, { memo, useEffect } from "react";
import {
  Button,
  FormControlLabel,
  Slider,
  Switch,
  Typography
} from "@mui/material";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import {
  SegmentationStatus,
  SegmentPromptMode,
  SegmentSettings,
  SegmentSourceLayerAction,
  SegmentBackend
} from "../types";
import type { SamModelInfo } from "../sam";
import {
  FAL_SAM_CAPABILITIES,
  LOCAL_SAM3_CAPABILITIES,
  LOCAL_SAM3_MODEL_ID
} from "../sam";
import { FlexRow, TextInput, Box } from "../../ui_primitives";
import {
  sketchButtonSmallSx,
  sketchSliderSx,
  SKETCH_COLORS,
  SKETCH_FONT
} from "../sketchStyles";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { useSketchStore } from "../state";
import { getLayerDataImageUrl } from "../serialization";
import {
  IN_PROGRESS_DOWNLOAD_STATES,
  LOCAL_SAM3_NODE_PACK_HINT
} from "./shared";

function promptModeHelpText(mode: SegmentPromptMode): string {
  if (mode === "point") {
    return "Click: include · Alt+click: exclude";
  }
  if (mode === "box") {
    return "Drag to draw a bounding box";
  }
  return "Auto-detect prominent objects";
}

/** Returns a user-friendly status message for the current segmentation phase. */
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

function getSegmentModelStatusText(
  isLocalSam3: boolean,
  localSam3Downloading: boolean | undefined,
  localSam3Ready: boolean,
  modelInfo: SamModelInfo | null
): string | undefined {
  if (isLocalSam3 && localSam3Downloading) {
    return "Local SAM3 is downloading";
  }
  if (localSam3Ready) {
    return "Local SAM3 is ready";
  }
  return modelInfo?.errorMessage;
}

interface SegmentSettingsPanelProps {
  settings: SegmentSettings;
  onChange: (settings: Partial<SegmentSettings>) => void;
  segmentationStatus: SegmentationStatus;
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
  const localSam3Download = useModelDownloadStore(
    (state) => state.downloads[LOCAL_SAM3_MODEL_ID]
  );
  const localSam3DownloadStatus = localSam3Download?.status;
  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const cancelDownload = useModelDownloadStore((state) => state.cancelDownload);
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
    return (
      selectedLayer?.type === "raster" &&
      !!getLayerDataImageUrl(selectedLayer.data)
    );
  });
  const isLocalSam3 = settings.backend === "local-sam3";
  const localSam3Downloading =
    localSam3DownloadStatus !== undefined &&
    IN_PROGRESS_DOWNLOAD_STATES.includes(localSam3DownloadStatus);
  const localSam3Ready = isLocalSam3 && modelInfo?.status === "available";
  const backendCapabilities =
    modelInfo?.capabilities ??
    (isLocalSam3
      ? LOCAL_SAM3_CAPABILITIES
      : {
          ...FAL_SAM_CAPABILITIES,
          textPrompts: false,
          pointPrompts: false,
          boxPrompts: false
        });
  const supportsPointPrompts = Boolean(backendCapabilities.pointPrompts);
  const supportsBoxPrompts = Boolean(backendCapabilities.boxPrompts);
  const supportsTextPrompts = Boolean(backendCapabilities.textPrompts);
  const backendReady = modelInfo?.status === "available";
  const canRunSegmentation =
    backendReady &&
    (settings.promptMode === "auto" ? canSplitSelectedLayer : true);
  const canDownloadLocalSam3 =
    isLocalSam3 &&
    !!modelInfo &&
    modelInfo.status === "not-installed" &&
    modelInfo.errorMessage !== LOCAL_SAM3_NODE_PACK_HINT &&
    localSam3DownloadStatus !== "completed" &&
    !localSam3Downloading;
  const visiblePromptModes: SegmentPromptMode[] = [
    ...(supportsPointPrompts ? ["point" as const] : []),
    ...(supportsBoxPrompts ? ["box" as const] : []),
    "auto"
  ];
  const isCurrentPromptModeVisible =
    settings.promptMode === "auto" ||
    (settings.promptMode === "point" && supportsPointPrompts) ||
    (settings.promptMode === "box" && supportsBoxPrompts);
  const segmentActionLabel =
    settings.promptMode === "auto" ? "Split selected layer" : "Segment";
  const showClearPrompts = settings.promptMode !== "auto";
  const backendLabel =
    modelInfo?.backendLabel ?? (isLocalSam3 ? "Local SAM3" : "Selected backend");
  const modelStatusText = getSegmentModelStatusText(
    isLocalSam3,
    localSam3Downloading,
    localSam3Ready,
    modelInfo
  );

  useEffect(() => {
    if (isCurrentPromptModeVisible) {
      return;
    }
    onChange({ promptMode: "auto" });
  }, [isCurrentPromptModeVisible, onChange, settings.promptMode]);

  useEffect(() => {
    if (!isLocalSam3) {
      return;
    }
    if (
      localSam3DownloadStatus === "completed" ||
      localSam3DownloadStatus === "cancelled" ||
      localSam3DownloadStatus === "error"
    ) {
      onCheckModel();
    }
  }, [isLocalSam3, localSam3DownloadStatus, onCheckModel]);

  return (
    <>
      <Box className="setting-row" sx={{ gap: "4px" }}>
        <Typography className="setting-label">Backend</Typography>
        <SketchModeToggle
          value={settings.backend}
          onChange={(_, v) => {
            if (v) {
              onChange({
                backend: v as SegmentBackend,
                // Default Local SAM3 to auto mode; prompted modes appear
                // only when installed node metadata confirms them.
                ...(v === "local-sam3" ? { promptMode: "auto" as const } : {})
              });
              onCheckModel();
            }
          }}
        >
          <SketchModeOption value="fal">fal.ai</SketchModeOption>
          <SketchModeOption value="local-sam3">Local SAM3</SketchModeOption>
        </SketchModeToggle>
      </Box>

      {modelInfo && (
        <Box sx={{ mb: "4px" }}>
          <Typography
            sx={{
              fontSize: SKETCH_FONT.xs,
              lineHeight: 1.3,
              color:
                modelInfo.status === "available"
                  ? "success.main"
                  : modelInfo.status === "error" ||
                      modelInfo.status === "not-installed"
                    ? "warning.main"
                    : SKETCH_COLORS.textFaint
            }}
          >
            {modelInfo.status === "available" &&
              (modelStatusText ?? `✓ ${modelInfo.modelName}`)}
            {modelInfo.status === "not-installed" &&
              (modelStatusText ?? "Model not available")}
            {modelInfo.status === "error" &&
              (modelStatusText ?? "Connection failed")}
            {modelInfo.status === "checking" && "Checking…"}
            {modelInfo.status === "downloading" &&
              `${modelStatusText ?? "Downloading…"} ${Math.round((modelInfo.downloadProgress ?? 0) * 100)}%`}
          </Typography>
        </Box>
      )}

      <SketchModeToggle
        value={settings.promptMode}
        onChange={(_, v) => {
          if (v) {
            onChange({ promptMode: v as SegmentPromptMode });
          }
        }}
        sx={{ mb: "4px" }}
      >
        {visiblePromptModes.includes("point") && (
          <SketchModeOption value="point">Point</SketchModeOption>
        )}
        {visiblePromptModes.includes("box") && (
          <SketchModeOption value="box">Box</SketchModeOption>
        )}
        <SketchModeOption value="auto">Auto</SketchModeOption>
      </SketchModeToggle>

      <Box className="setting-row">
        <Typography className="setting-label">Max Objects</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={20}
          value={settings.maxObjects}
          onChange={(_, v) => onChange({ maxObjects: v as number })}
        />
        <Typography className="setting-value">{settings.maxObjects}</Typography>
      </Box>

      <Box className="setting-row">
        <Typography className="setting-label">Confidence</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.05}
          value={settings.confidenceThreshold}
          onChange={(_, v) => onChange({ confidenceThreshold: v as number })}
        />
        <Typography className="setting-value">
          {settings.confidenceThreshold.toFixed(2)}
        </Typography>
      </Box>

      <Box className="setting-row">
        <Typography className="setting-label">Min Size</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={10000}
          step={100}
          value={settings.minObjectSize}
          onChange={(_, v) => onChange({ minObjectSize: v as number })}
        />
        <Typography className="setting-value">
          {settings.minObjectSize}
        </Typography>
      </Box>

      <Box className="setting-row">
        <Typography className="setting-label">Feather</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={20}
          step={1}
          value={settings.maskFeather}
          onChange={(_, v) => onChange({ maskFeather: v as number })}
        />
        <Typography className="setting-value">
          {settings.maskFeather}
        </Typography>
      </Box>

      <Box className="setting-row" sx={{ gap: "4px" }}>
        <Typography className="setting-label">Source Layer</Typography>
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
          <Typography sx={{ fontSize: SKETCH_FONT.xs }}>
            {settings.outputCutouts ? "Cutout layers" : "Mask layers"}
          </Typography>
        }
        sx={{ mt: "2px", ml: 0 }}
      />

      {supportsTextPrompts && (
        <Box className="setting-row" sx={{ alignItems: "flex-start" }}>
          <Typography className="setting-label" sx={{ pt: "6px" }}>
            Concept
          </Typography>
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
      )}

      {isLocalSam3 && (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Points / Side</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={4}
              max={128}
              step={4}
              value={settings.pointsPerSide}
              onChange={(_, value) =>
                onChange({ pointsPerSide: value as number })
              }
            />
            <Typography className="setting-value">
              {settings.pointsPerSide}
            </Typography>
          </Box>

          <Box className="setting-row">
            <Typography className="setting-label">Pred IoU</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={1}
              step={0.01}
              value={settings.predIouThresh}
              onChange={(_, value) =>
                onChange({ predIouThresh: value as number })
              }
            />
            <Typography className="setting-value">
              {settings.predIouThresh.toFixed(2)}
            </Typography>
          </Box>
        </>
      )}

      <FlexRow wrap gap={0.5} sx={{ mt: "4px" }}>
        {!isRunning && !isPreviewing && (
          <>
            {canDownloadLocalSam3 && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  startDownload(LOCAL_SAM3_MODEL_ID, "hf.model");
                }}
                sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
              >
                Download Local SAM3
              </Button>
            )}
            {isLocalSam3 && localSam3Downloading && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => {
                  cancelDownload(LOCAL_SAM3_MODEL_ID);
                }}
                sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
              >
                Cancel download
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              onClick={onRunSegmentation}
              disabled={!canRunSegmentation}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              {segmentActionLabel}
            </Button>
            {showClearPrompts && (
              <Button
                size="small"
                variant="outlined"
                onClick={onClearPrompts}
                sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
              >
                Clear
              </Button>
            )}
          </>
        )}
        {isRunning && (
          <>
            <Typography
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
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={onCancelSegmentation}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Cancel
            </Button>
          </>
        )}
        {isPreviewing && (
          <>
            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={onApplyResult}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Apply
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onDiscardResult}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Discard
            </Button>
          </>
        )}
      </FlexRow>

      <Typography
        sx={{
          fontSize: SKETCH_FONT.xs,
          color: SKETCH_COLORS.textFaint,
          lineHeight: 1.3,
          maxWidth: 320,
          mt: "4px"
        }}
      >
        {supportsPointPrompts || supportsBoxPrompts || supportsTextPrompts
          ? promptModeHelpText(settings.promptMode)
          : `${backendLabel} currently supports automatic layer split only.`}
      </Typography>

      {settings.promptMode === "auto" && !canSplitSelectedLayer && (
        <Typography
          sx={{
            fontSize: SKETCH_FONT.xs,
            color: SKETCH_COLORS.textFaint,
            lineHeight: 1.3,
            mt: "2px"
          }}
        >
          Select exactly one raster layer to split.
        </Typography>
      )}

      {segmentationStatus === "error" && (
        <Typography
          sx={{
            fontSize: SKETCH_FONT.xs,
            color: "error.main",
            lineHeight: 1.3,
            mt: "2px"
          }}
        >
          Segmentation failed. Check model availability and try again.
        </Typography>
      )}
    </>
  );
});
