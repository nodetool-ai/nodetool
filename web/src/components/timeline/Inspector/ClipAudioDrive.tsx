/**
 * ClipAudioDrive — "Animate from audio" for one clip.
 *
 * Picks an audio clip, a property and a shape, and asks the server to measure
 * the audio and write the curve. Nothing is measured here: the browser has no
 * decoder for every codec a clip can carry and the curve has to end up in the
 * stored document anyway, so the whole job is the `bake_audio_animation`
 * capability's (`POST /api/timelines/:id/bake-audio-animation`) and this panel
 * only carries the settings and reports what came back.
 *
 * A curve this panel produced carries `custom.bakedFrom.kind === "audio"`, so
 * a second run replaces it rather than stacking another one — which is also
 * how the form pre-fills: the settings of the bake already on the clip.
 * A curve someone keyframed by hand carries no `bakedFrom` and is never
 * matched, so it cannot be overwritten from here.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";

import {
  AUDIO_BAKED_ANIMATION_KIND,
  findBakedAnimationIndex,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  AUDIO_DRIVE_PROPERTIES,
  type AudioDriveMode,
  type AudioDriveProperty,
  type BakeAudioAnimationBody
} from "../../../utils/timelineAudioBake";
import {
  Button,
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  ToggleGroup,
  ToggleOption
} from "../../ui_primitives";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow
} from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";
import { BakedCurvePreview, type BakedCurvePoint } from "./BakedCurvePreview";

/** The capability's own defaults, so an untouched form bakes what it would. */
const DEFAULT_ATTACK_MS = 20;
const DEFAULT_RELEASE_MS = 150;

interface PropertyPreset {
  label: string;
  /** Where the curve rests and where it peaks, in the property's own units. */
  low: number;
  high: number;
  unit?: string;
  /** Hoisted so `InspectorPillInput`'s memo holds — see ClipAdjustments. */
  scrub: { step: number };
}

/**
 * Per-property starting ranges. A range is in the property's units, and the
 * useful amount of motion differs by an order of magnitude between them —
 * 15% of scale reads like the same gesture as 20px of position.
 */
const PROPERTY_PRESETS: Record<AudioDriveProperty, PropertyPreset> = {
  scale: { label: "Scale", low: 1, high: 1.15, unit: "×", scrub: { step: 0.01 } },
  opacity: { label: "Opacity", low: 0.6, high: 1, scrub: { step: 0.01 } },
  offsetX: {
    label: "Position X",
    low: -20,
    high: 20,
    unit: "px",
    scrub: { step: 1 }
  },
  offsetY: {
    label: "Position Y",
    low: -20,
    high: 20,
    unit: "px",
    scrub: { step: 1 }
  }
};

const PROPERTY_OPTIONS = AUDIO_DRIVE_PROPERTIES.map((property) => ({
  value: property,
  label: PROPERTY_PRESETS[property].label
}));

const SCRUB_SENSITIVITY = { step: 0.05, min: 0.25, max: 4 };
const SCRUB_MS = { step: 5, min: 0 };
const SCRUB_OFFSET_MS = { step: 5 };

/**
 * Whether a clip can carry an audio-driven curve: it has to have something to
 * animate. Audio and MIDI clips are heard, not seen, and a subtitle's motion
 * belongs to the caption style rather than to a curve.
 */
export function canDriveFromAudio(clip: TimelineClip): boolean {
  return (
    clip.mediaType !== "audio" &&
    clip.mediaType !== "midi" &&
    clip.caption === undefined
  );
}

/** How long two clips are on screen together. 0 when they never are. */
function overlapMs(a: TimelineClip, b: TimelineClip): number {
  return Math.max(
    0,
    Math.min(a.startMs + a.durationMs, b.startMs + b.durationMs) -
      Math.max(a.startMs, b.startMs)
  );
}

/** Fields the user has moved. Absent means "follow the bake, or the preset". */
interface DriveForm {
  audioClipId?: string;
  mode?: AudioDriveMode;
  low?: number;
  high?: number;
  sensitivity?: number;
  attackMs?: number;
  releaseMs?: number;
  offsetMs?: number;
}

/** Numeric field of the form the user just committed. Junk is ignored. */
function commitNumber(
  setForm: React.Dispatch<React.SetStateAction<DriveForm>>,
  key: keyof Omit<DriveForm, "audioClipId" | "mode">,
  raw: string
): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  setForm((prev) => ({ ...prev, [key]: value }));
}

/**
 * The budget knobs an earlier bake set. Not on the form — carried through so a
 * re-bake keeps what an agent chose instead of resetting it to the defaults.
 */
function carriedBudget(
  settings: Record<string, number | string | boolean> | undefined
): Pick<BakeAudioAnimationBody, "tolerance" | "max_points" | "frame_ms"> {
  const carried: Pick<
    BakeAudioAnimationBody,
    "tolerance" | "max_points" | "frame_ms"
  > = {};
  for (const [key, field] of [
    ["tolerance", "tolerance"],
    ["maxPoints", "max_points"],
    ["frameMs", "frame_ms"]
  ] as const) {
    const value = settings?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      carried[field] = value;
    }
  }
  return carried;
}

interface StatusLine {
  tone: "ok" | "error";
  text: string;
}

interface ClipAudioDriveProps {
  clip: TimelineClip;
}

export const ClipAudioDrive: React.FC<ClipAudioDriveProps> = memo(({ clip }) => {
  const [open, setOpen] = usePersistedFold("audioDrive");
  const clips = useTimelineStore((s) => s.clips);
  const bakeAudioAnimation = useTimelineStore((s) => s.bakeAudioAnimation);

  const [property, setProperty] = useState<AudioDriveProperty>("scale");
  const [form, setForm] = useState<DriveForm>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusLine | null>(null);

  const audioClips = useMemo(
    () => clips.filter((candidate) => candidate.mediaType === "audio"),
    [clips]
  );

  const audioOptions = useMemo(
    () =>
      audioClips.map((audio) => ({
        value: audio.id,
        label: audio.name || audio.id
      })),
    [audioClips]
  );

  // Default to the audio the target actually plays over: with a music bed and
  // a voiceover on the timeline, the one under this clip is the one meant.
  const overlappingAudioId = useMemo(() => {
    let bestId = "";
    let bestOverlap = -1;
    for (const audio of audioClips) {
      const overlap = overlapMs(audio, clip);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestId = audio.id;
      }
    }
    return bestId;
  }, [audioClips, clip]);

  const animations = clip.animations;
  const existingIndex = findBakedAnimationIndex(
    animations,
    AUDIO_BAKED_ANIMATION_KIND,
    property
  );
  const existing = existingIndex >= 0 ? animations?.[existingIndex] : undefined;
  const bakedFrom = existing?.custom?.bakedFrom;
  const settings = bakedFrom?.settings;

  const settingNumber = (key: string, fallback: number): number => {
    const value = settings?.[key];
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  };

  const preset = PROPERTY_PRESETS[property];
  // The bake's own audio clip only counts while it is still on the timeline.
  const bakedAudioId =
    bakedFrom?.clipId !== undefined &&
    audioClips.some((audio) => audio.id === bakedFrom.clipId)
      ? bakedFrom.clipId
      : "";
  const audioClipId =
    form.audioClipId ??
    (bakedAudioId !== "" ? bakedAudioId : overlappingAudioId);
  const mode: AudioDriveMode =
    form.mode ?? (settings?.mode === "beats" ? "beats" : "envelope");
  const low = form.low ?? settingNumber("outputLow", preset.low);
  const high = form.high ?? settingNumber("outputHigh", preset.high);
  const sensitivity = form.sensitivity ?? settingNumber("sensitivity", 1);
  const attackMs = form.attackMs ?? settingNumber("attackMs", DEFAULT_ATTACK_MS);
  const releaseMs =
    form.releaseMs ?? settingNumber("releaseMs", DEFAULT_RELEASE_MS);
  const offsetMs = form.offsetMs ?? settingNumber("offsetMs", 0);

  const previewPoints = useMemo<BakedCurvePoint[]>(() => {
    const curve = existing?.custom?.curves.find(
      (candidate) => candidate.property === property
    );
    if (!curve) return [];
    return curve.keyframes.map((keyframe) => ({
      timeMs: keyframe.sourceMs ?? keyframe.t,
      value: keyframe.value
    }));
  }, [existing, property]);

  const handleProperty = useCallback((next: string) => {
    setProperty(next as AudioDriveProperty);
    // Every field the form carries is in the property's units or scaled to
    // them, so a property change starts from that property's own settings
    // rather than from numbers chosen for the previous one.
    setForm({});
    setStatus(null);
  }, []);

  const handleAudioClip = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, audioClipId: next }));
  }, []);

  const handleMode = useCallback(
    (_event: React.MouseEvent<HTMLElement>, next: AudioDriveMode | null) => {
      if (next === null) return;
      setForm((prev) => ({ ...prev, mode: next }));
    },
    []
  );

  // One stable committer per field. `InspectorPillInput` is memoized, so a
  // handler rebuilt during render would re-render every field on every
  // keystroke in any of them.
  const handleLow = useCallback(
    (raw: string) => commitNumber(setForm, "low", raw),
    []
  );
  const handleHigh = useCallback(
    (raw: string) => commitNumber(setForm, "high", raw),
    []
  );
  const handleAttack = useCallback(
    (raw: string) => commitNumber(setForm, "attackMs", raw),
    []
  );
  const handleRelease = useCallback(
    (raw: string) => commitNumber(setForm, "releaseMs", raw),
    []
  );
  const handleOffset = useCallback(
    (raw: string) => commitNumber(setForm, "offsetMs", raw),
    []
  );

  const handleSensitivity = useCallback((next: number) => {
    setForm((prev) => ({ ...prev, sensitivity: next }));
  }, []);

  const handleBake = useCallback(async () => {
    if (!audioClipId) return;
    setPending(true);
    setStatus(null);
    try {
      const result = await bakeAudioAnimation({
        audio_clip_id: audioClipId,
        target_clip_id: clip.id,
        property,
        output_range: [low, high],
        mode,
        sensitivity,
        attack_ms: attackMs,
        release_ms: releaseMs,
        offset_ms: offsetMs,
        ...carriedBudget(settings)
      });
      setStatus({
        tone: "ok",
        text: result.truncated
          ? `${result.keyframeCount} keyframes. The audio ran past the analysis budget, so only its first stretch was measured.`
          : `${result.keyframeCount} keyframes.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setPending(false);
    }
  }, [
    attackMs,
    bakeAudioAnimation,
    clip.id,
    high,
    low,
    mode,
    offsetMs,
    property,
    releaseMs,
    audioClipId,
    sensitivity,
    settings
  ]);

  if (!canDriveFromAudio(clip)) return null;

  return (
    <>
      <InspectorDivider />
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title="Audio drive"
            icon={<GraphicEqOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.sm} sx={{ py: SPACING.xs }}>
          {audioClips.length === 0 ? (
            <Caption color="muted">
              Add an audio clip to the timeline to drive this one from it.
            </Caption>
          ) : (
            <>
              <InspectorRow label="Audio">
                <InspectorSelect
                  label="Audio clip to measure"
                  value={audioClipId}
                  options={audioOptions}
                  onChange={handleAudioClip}
                  disabled={pending}
                  grow
                />
              </InspectorRow>
              <InspectorRow label="Property">
                <InspectorSelect
                  label="Property to drive"
                  value={property}
                  options={PROPERTY_OPTIONS}
                  onChange={handleProperty}
                  disabled={pending}
                  grow
                />
              </InspectorRow>
              <InspectorRow label="Shape">
                <ToggleGroup
                  size="small"
                  segmented
                  exclusive
                  value={mode}
                  onChange={handleMode}
                  disabled={pending}
                  aria-label="Curve shape"
                >
                  <ToggleOption value="envelope">Envelope</ToggleOption>
                  <ToggleOption value="beats">Beats</ToggleOption>
                </ToggleGroup>
              </InspectorRow>
              <InspectorRow label="Range">
                <InspectorPillInput
                  value={String(low)}
                  onCommit={handleLow}
                  unit={preset.unit}
                  disabled={pending}
                  minWidth={52}
                  scrub={preset.scrub}
                  ariaLabel="Range quiet value"
                />
                <InspectorPillInput
                  value={String(high)}
                  onCommit={handleHigh}
                  unit={preset.unit}
                  disabled={pending}
                  minWidth={52}
                  scrub={preset.scrub}
                  ariaLabel="Range loud value"
                />
              </InspectorRow>
              <InspectorSliderRow
                label="Sensitivity"
                value={sensitivity}
                display={sensitivity.toFixed(2)}
                min={SCRUB_SENSITIVITY.min}
                max={SCRUB_SENSITIVITY.max}
                step={SCRUB_SENSITIVITY.step}
                disabled={pending}
                onChange={handleSensitivity}
                origin={1}
              />
              <InspectorRow label="Attack">
                <InspectorPillInput
                  value={String(attackMs)}
                  onCommit={handleAttack}
                  unit="ms"
                  disabled={pending}
                  scrub={SCRUB_MS}
                  ariaLabel="Attack"
                />
              </InspectorRow>
              <InspectorRow label="Release">
                <InspectorPillInput
                  value={String(releaseMs)}
                  onCommit={handleRelease}
                  unit="ms"
                  disabled={pending}
                  scrub={SCRUB_MS}
                  ariaLabel="Release"
                />
              </InspectorRow>
              <InspectorRow label="Offset">
                <InspectorPillInput
                  value={String(offsetMs)}
                  onCommit={handleOffset}
                  unit="ms"
                  disabled={pending}
                  scrub={SCRUB_OFFSET_MS}
                  ariaLabel="Offset"
                />
              </InspectorRow>
              <FlexRow align="center" gap={SPACING.sm}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleBake}
                  disabled={pending || audioClipId === ""}
                  startIcon={
                    pending ? (
                      <LoadingSpinner inline size={16} color="inherit" />
                    ) : undefined
                  }
                >
                  {existing ? "Re-bake" : "Animate from audio"}
                </Button>
              </FlexRow>
              {status && (
                <Caption color={status.tone === "error" ? "error" : "muted"}>
                  {status.text}
                </Caption>
              )}
              {previewPoints.length > 0 && (
                <BakedCurvePreview
                  points={previewPoints}
                  label={`${preset.label} from audio`}
                />
              )}
            </>
          )}
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
});

ClipAudioDrive.displayName = "ClipAudioDrive";
