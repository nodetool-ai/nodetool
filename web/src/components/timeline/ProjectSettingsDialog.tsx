/** @jsxImportSource @emotion/react */
/**
 * ProjectSettingsDialog — sequence-level canvas, frame-rate and tempo settings.
 *
 * Like the project settings in a video editor: pick a canvas resolution
 * (preset or custom width/height) and a frame rate. Both feed the live preview
 * compositor and the offline export, which read `width`/`height`/`fps` from the
 * {@link TimelineStore}. Applying persists via {@link useTimelineProjectSettings}.
 *
 * Tempo takes a different route: `width`/`height`/`fps` are top-level columns
 * this dialog PATCHes, while `tempo` rides in the document slice the autosave
 * hook already carries, so applying it is one `setTempo` call on the store.
 */
import React, { memo, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { resolveTempo } from "@nodetool-ai/timeline";

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

const MIN_BPM = 20;
const MAX_BPM = 300;
const MIN_BEATS_PER_BAR = 1;
const MAX_BEATS_PER_BAR = 16;

const BEAT_UNITS = [2, 4, 8, 16] as const;
const BEAT_UNIT_OPTIONS: readonly SelectOption[] = BEAT_UNITS.map((unit) => ({
  value: String(unit),
  label: `/ ${unit}`
}));

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

const isValidBpm = (n: number): boolean =>
  Number.isFinite(n) && n >= MIN_BPM && n <= MAX_BPM;

const isValidBeatsPerBar = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_BEATS_PER_BAR && n <= MAX_BEATS_PER_BAR;

const isValidOffset = (n: number): boolean => Number.isFinite(n) && n >= 0;

// ── Component ──────────────────────────────────────────────────────────────────

interface ProjectSettingsDialogProps {
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
  const tempo = useTimelineStore((s) => resolveTempo(s));
  const setTempo = useTimelineStore((s) => s.setTempo);
  const midiClipCount = useTimelineStore(
    (s) => s.clips.filter((c) => c.mediaType === "midi").length
  );
  const { save, isSaving } = useTimelineProjectSettings();

  // Local draft as strings so partially-typed input doesn't fight the parser.
  const [widthText, setWidthText] = useState(String(width));
  const [heightText, setHeightText] = useState(String(height));
  const [fpsText, setFpsText] = useState(String(fps));
  const [bpmText, setBpmText] = useState(String(tempo.bpm));
  const [beatsPerBarText, setBeatsPerBarText] = useState(
    String(tempo.timeSignature.beatsPerBar)
  );
  const [beatUnit, setBeatUnit] = useState(
    String(tempo.timeSignature.beatUnit)
  );
  const [offsetText, setOffsetText] = useState(String(tempo.offsetMs));

  // Re-seed the draft from the store each time the dialog opens.
  useEffect(() => {
    if (open) {
      setWidthText(String(width));
      setHeightText(String(height));
      setFpsText(String(fps));
      setBpmText(String(tempo.bpm));
      setBeatsPerBarText(String(tempo.timeSignature.beatsPerBar));
      setBeatUnit(String(tempo.timeSignature.beatUnit));
      setOffsetText(String(tempo.offsetMs));
    }
  }, [open, width, height, fps, tempo]);

  const widthNum = Number(widthText);
  const heightNum = Number(heightText);
  const fpsNum = Number(fpsText);

  const bpmNum = Number(bpmText);
  const beatsPerBarNum = Number(beatsPerBarText);
  const beatUnitNum = Number(beatUnit);
  const offsetNum = Number(offsetText);

  const widthValid = isValidDim(widthNum);
  const heightValid = isValidDim(heightNum);
  const fpsValid = isValidFps(fpsNum);
  const bpmValid = isValidBpm(bpmNum);
  const beatsPerBarValid = isValidBeatsPerBar(beatsPerBarNum);
  const offsetValid = isValidOffset(offsetNum);
  const tempoValid = bpmValid && beatsPerBarValid && offsetValid;
  const allValid = widthValid && heightValid && fpsValid && tempoValid;

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

  const canvasDirty =
    widthNum !== width || heightNum !== height || fpsNum !== fps;
  const tempoDirty =
    bpmNum !== tempo.bpm ||
    beatsPerBarNum !== tempo.timeSignature.beatsPerBar ||
    beatUnitNum !== tempo.timeSignature.beatUnit ||
    offsetNum !== tempo.offsetMs;
  const dirty = allValid && (canvasDirty || tempoDirty);

  const handleApply = async () => {
    if (!allValid) return;
    if (tempoDirty) {
      setTempo({
        bpm: bpmNum,
        offsetMs: offsetNum,
        timeSignature: {
          beatsPerBar: beatsPerBarNum,
          beatUnit: beatUnitNum
        }
      });
    }
    if (canvasDirty) {
      await save({ width: widthNum, height: heightNum, fps: fpsNum });
    }
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
          <Text size="small" weight={600} sx={{ mb: 1.5 }}>
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
          <Text size="small" weight={600} sx={{ mb: 1.5 }}>
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

        {/* ── Tempo ───────────────────────────────────────────────── */}
        <FlexColumn gap={1.5}>
          <Text size="small" weight={600} sx={{ mb: 1.5 }}>
            Tempo
          </Text>
          <FlexRow gap={1.5} align="flex-start">
            <TextInput
              label="BPM"
              type="number"
              size="small"
              value={bpmText}
              onChange={(e) => setBpmText(e.target.value)}
              errorMessage={
                bpmText !== "" && !bpmValid ? `${MIN_BPM}–${MAX_BPM}` : undefined
              }
              inputProps={{ min: MIN_BPM, max: MAX_BPM, step: 1 }}
              sx={{ flex: 1 }}
            />
            <TextInput
              label="Beats per bar"
              type="number"
              size="small"
              value={beatsPerBarText}
              onChange={(e) => setBeatsPerBarText(e.target.value)}
              errorMessage={
                beatsPerBarText !== "" && !beatsPerBarValid
                  ? `${MIN_BEATS_PER_BAR}–${MAX_BEATS_PER_BAR}`
                  : undefined
              }
              inputProps={{
                min: MIN_BEATS_PER_BAR,
                max: MAX_BEATS_PER_BAR,
                step: 1
              }}
              sx={{ flex: 1 }}
            />
            <FlexColumn sx={{ flex: 1 }}>
              <SelectField
                label="Beat unit"
                variant="outlined"
                value={beatUnit}
                onChange={setBeatUnit}
                options={BEAT_UNIT_OPTIONS}
                size="small"
              />
            </FlexColumn>
          </FlexRow>
          <TextInput
            label="Beat one at"
            type="number"
            size="small"
            value={offsetText}
            onChange={(e) => setOffsetText(e.target.value)}
            errorMessage={
              offsetText !== "" && !offsetValid ? "0 or more" : undefined
            }
            inputProps={{ min: 0, step: 1 }}
            sx={{ mt: 2, width: 160 }}
          />
          {midiClipCount > 0 && (
            <Caption sx={{ color: "text.secondary" }}>
              Your {midiClipCount === 1 ? "part" : "parts"} keep the same notes
              and play at the new speed — the {midiClipCount === 1 ? "clip" : "clips"}{" "}
              stretch around beat one. Picture and audio clips stay where they are.
            </Caption>
          )}
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
