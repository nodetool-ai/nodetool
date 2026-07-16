/** @jsxImportSource @emotion/react */
/**
 * ProjectSettingsDialog — sequence-level canvas & frame-rate settings.
 *
 * Like the project settings in a video editor: pick a canvas resolution
 * (preset or custom width/height) and a frame rate. Both feed the live preview
 * compositor and the offline export, which read `width`/`height`/`fps` from the
 * {@link TimelineStore}. Applying persists via {@link useTimelineProjectSettings}.
 */
import React, { memo, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  Caption,
  Dialog,
  FlexColumn,
  FlexRow,
  SelectField,
  Text,
  TextInput
} from "../ui_primitives";
import type { SelectOption } from "../ui_primitives";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineProjectSettings } from "../../hooks/timeline/useTimelineProjectSettings";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_DIM = 16;
const MAX_DIM = 7680;
const MIN_FPS = 1;
const MAX_FPS = 240;

const CUSTOM = "custom";

interface ResolutionPreset {
  value: string;
  label: string;
  width: number;
  height: number;
}

const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  { value: "1920x1080", label: "1080p — 1920 × 1080 (16:9)", width: 1920, height: 1080 },
  { value: "1280x720", label: "720p — 1280 × 720 (16:9)", width: 1280, height: 720 },
  { value: "3840x2160", label: "4K UHD — 3840 × 2160 (16:9)", width: 3840, height: 2160 },
  { value: "1080x1920", label: "Vertical — 1080 × 1920 (9:16)", width: 1080, height: 1920 },
  { value: "1080x1080", label: "Square — 1080 × 1080 (1:1)", width: 1080, height: 1080 },
  { value: "1080x1350", label: "Portrait — 1080 × 1350 (4:5)", width: 1080, height: 1350 }
];

const RESOLUTION_OPTIONS: readonly SelectOption[] = [
  ...RESOLUTION_PRESETS.map((p) => ({ value: p.value, label: p.label })),
  { value: CUSTOM, label: "Custom…" }
];

const FPS_PRESETS = [24, 25, 30, 50, 60] as const;
const FPS_OPTIONS: readonly SelectOption[] = [
  ...FPS_PRESETS.map((f) => ({ value: String(f), label: `${f} fps` })),
  { value: CUSTOM, label: "Custom…" }
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const presetValueFor = (width: number, height: number): string =>
  RESOLUTION_PRESETS.find((p) => p.width === width && p.height === height)
    ?.value ?? CUSTOM;

const isValidDim = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_DIM && n <= MAX_DIM;

const isValidFps = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_FPS && n <= MAX_FPS;

// ── Component ──────────────────────────────────────────────────────────────────

export interface ProjectSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const ProjectSettingsDialogInternal: React.FC<ProjectSettingsDialogProps> = ({
  open,
  onClose
}) => {
  const { fps, width, height } = useTimelineStore(
    useShallow((s) => ({ fps: s.fps, width: s.width, height: s.height }))
  );
  const { save, isSaving } = useTimelineProjectSettings();

  // Local draft as strings so partially-typed input doesn't fight the parser.
  const [widthText, setWidthText] = useState(String(width));
  const [heightText, setHeightText] = useState(String(height));
  const [fpsText, setFpsText] = useState(String(fps));

  // Re-seed the draft from the store each time the dialog opens.
  useEffect(() => {
    if (open) {
      setWidthText(String(width));
      setHeightText(String(height));
      setFpsText(String(fps));
    }
  }, [open, width, height, fps]);

  const widthNum = Number(widthText);
  const heightNum = Number(heightText);
  const fpsNum = Number(fpsText);

  const widthValid = isValidDim(widthNum);
  const heightValid = isValidDim(heightNum);
  const fpsValid = isValidFps(fpsNum);
  const allValid = widthValid && heightValid && fpsValid;

  const resolutionPreset = useMemo(
    () =>
      widthValid && heightValid
        ? presetValueFor(widthNum, heightNum)
        : CUSTOM,
    [widthValid, heightValid, widthNum, heightNum]
  );

  const fpsPreset = useMemo(
    () => (fpsValid && (FPS_PRESETS as readonly number[]).includes(fpsNum) ? String(fpsNum) : CUSTOM),
    [fpsValid, fpsNum]
  );

  const handleResolutionPreset = (value: string) => {
    const preset = RESOLUTION_PRESETS.find((p) => p.value === value);
    if (preset) {
      setWidthText(String(preset.width));
      setHeightText(String(preset.height));
    }
  };

  const handleFpsPreset = (value: string) => {
    if (value !== CUSTOM) setFpsText(value);
  };

  const dirty =
    allValid && (widthNum !== width || heightNum !== height || fpsNum !== fps);

  const handleApply = async () => {
    if (!allValid) return;
    await save({ width: widthNum, height: heightNum, fps: fpsNum });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={() => onClose()}
      title="Project settings"
      onConfirm={() => void handleApply()}
      onCancel={onClose}
      confirmText="Apply"
      cancelText="Cancel"
      isLoading={isSaving}
      confirmDisabled={!allValid || !dirty || isSaving}
      minWidth="min(440px, 100vw - 32px)"
    >
      <FlexColumn gap={4} sx={{ py: 1 }}>
        {/* ── Canvas size ─────────────────────────────────────────── */}
        <FlexColumn gap={1.5}>
          <Text size="small" sx={{ fontWeight: 600, mb: 1.5 }}>
            Canvas size
          </Text>
          {/* Label hidden — the section header names it; an outlined variant
              keeps it consistent with the Width/Height fields below. */}
          <SelectField
            label="Canvas preset"
            hideLabel
            variant="outlined"
            value={resolutionPreset}
            onChange={handleResolutionPreset}
            options={RESOLUTION_OPTIONS}
            size="small"
          />
          <FlexRow gap={1.5} align="flex-start" sx={{ mt: 2 }}>
            <TextInput
              label="Width"
              type="number"
              size="small"
              value={widthText}
              onChange={(e) => setWidthText(e.target.value)}
              errorMessage={
                widthText !== "" && !widthValid
                  ? `${MIN_DIM}–${MAX_DIM}`
                  : undefined
              }
              inputProps={{ min: MIN_DIM, max: MAX_DIM, step: 2 }}
              sx={{ flex: 1 }}
            />
            <TextInput
              label="Height"
              type="number"
              size="small"
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
              errorMessage={
                heightText !== "" && !heightValid
                  ? `${MIN_DIM}–${MAX_DIM}`
                  : undefined
              }
              inputProps={{ min: MIN_DIM, max: MAX_DIM, step: 2 }}
              sx={{ flex: 1 }}
            />
          </FlexRow>
        </FlexColumn>

        {/* ── Frame rate ──────────────────────────────────────────── */}
        <FlexColumn gap={1.5}>
          <Text size="small" sx={{ fontWeight: 600, mb: 1.5 }}>
            Frame rate
          </Text>
          <FlexRow gap={1.5} align="flex-start">
            <FlexColumn sx={{ flex: 1 }}>
              <SelectField
                label="Frame rate preset"
                hideLabel
                variant="outlined"
                value={fpsPreset}
                onChange={handleFpsPreset}
                options={FPS_OPTIONS}
                size="small"
              />
            </FlexColumn>
            <TextInput
              label="fps"
              type="number"
              size="small"
              value={fpsText}
              onChange={(e) => setFpsText(e.target.value)}
              errorMessage={
                fpsText !== "" && !fpsValid
                  ? `${MIN_FPS}–${MAX_FPS}`
                  : undefined
              }
              inputProps={{ min: MIN_FPS, max: MAX_FPS, step: 1 }}
              sx={{ width: 120 }}
            />
          </FlexRow>
        </FlexColumn>

        <Caption sx={{ color: "text.secondary" }}>
          Applies to the preview and the exported video. Existing clips keep
          their own source resolution and are scaled to fit the canvas.
        </Caption>
      </FlexColumn>
    </Dialog>
  );
};

export const ProjectSettingsDialog = memo(ProjectSettingsDialogInternal);
ProjectSettingsDialog.displayName = "ProjectSettingsDialog";

export default ProjectSettingsDialog;
