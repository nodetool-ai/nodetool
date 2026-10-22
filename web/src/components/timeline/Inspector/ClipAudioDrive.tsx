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
import { useTranslation } from "react-i18next";

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
  scale: { low: 1, high: 1.15, unit: "×", scrub: { step: 0.01 } },
  opacity: { low: 0.6, high: 1, scrub: { step: 0.01 } },
  offsetX: {
    low: -20,
    high: 20,
    unit: "px",
    scrub: { step: 1 }
  },
  offsetY: {
    low: -20,
    high: 20,
    unit: "px",
    scrub: { step: 1 }
  }
};

const PROPERTY_LABEL_KEYS: Record<AudioDriveProperty, string> = {
  scale: "audioDrive.properties.scale",
  opacity: "audioDrive.properties.opacity",
  offsetX: "audioDrive.properties.positionX",
  offsetY: "audioDrive.properties.positionY"
};

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

export const ClipAudioDrive: React.FC<ClipAudioDriveProps> = memo(
  ({ clip }) => {
    const { t } = useTranslation();
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
    const existing =
      existingIndex >= 0 ? animations?.[existingIndex] : undefined;
    const bakedFrom = existing?.custom?.bakedFrom;
    const settings = bakedFrom?.settings;

    const settingNumber = (key: string, fallback: number): number => {
      const value = settings?.[key];
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : fallback;
    };

    const preset = PROPERTY_PRESETS[property];
    const propertyOptions = AUDIO_DRIVE_PROPERTIES.map((item) => ({
      value: item,
      label: t(`pass3_23.${PROPERTY_LABEL_KEYS[item]}`)
    }));
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
    const attackMs =
      form.attackMs ?? settingNumber("attackMs", DEFAULT_ATTACK_MS);
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
            ? t("pass3_23.audioDrive.bake.truncated", {
                count: result.keyframeCount
              })
            : t("pass3_23.audioDrive.bake.complete", {
                count: result.keyframeCount
              })
        });
      } catch (error) {
        setStatus({
          tone: "error",
          text: t("pass3_23.audioDrive.bake.failed", {
            error: error instanceof Error ? error.message : String(error)
          })
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
      settings,
      t
    ]);

    if (!canDriveFromAudio(clip)) return null;

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_23.audioDrive.title")}
              icon={<GraphicEqOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.sm} sx={{ py: SPACING.xs }}>
            {audioClips.length === 0 ? (
              <Caption color="muted">{t("pass3_23.audioDrive.empty")}</Caption>
            ) : (
              <>
                <InspectorRow label={t("pass3_23.audioDrive.audio")}>
                  <InspectorSelect
                    label={t("pass3_23.audioDrive.audioToMeasure")}
                    value={audioClipId}
                    options={audioOptions}
                    onChange={handleAudioClip}
                    disabled={pending}
                    grow
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_23.audioDrive.property")}>
                  <InspectorSelect
                    label={t("pass3_23.audioDrive.propertyToDrive")}
                    value={property}
                    options={propertyOptions}
                    onChange={handleProperty}
                    disabled={pending}
                    grow
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_23.audioDrive.shape")}>
                  <ToggleGroup
                    size="small"
                    segmented
                    exclusive
                    value={mode}
                    onChange={handleMode}
                    disabled={pending}
                    aria-label={t("pass3_23.audioDrive.curveShape")}
                  >
                    <ToggleOption value="envelope">
                      {t("pass3_23.audioDrive.envelope")}
                    </ToggleOption>
                    <ToggleOption value="beats">
                      {t("pass3_23.audioDrive.beats")}
                    </ToggleOption>
                  </ToggleGroup>
                </InspectorRow>
                <InspectorRow label={t("pass3_23.audioDrive.range")}>
                  <InspectorPillInput
                    value={String(low)}
                    onCommit={handleLow}
                    unit={preset.unit}
                    disabled={pending}
                    minWidth={52}
                    scrub={preset.scrub}
                    ariaLabel={t("pass3_23.audioDrive.quietValue")}
                  />
                  <InspectorPillInput
                    value={String(high)}
                    onCommit={handleHigh}
                    unit={preset.unit}
                    disabled={pending}
                    minWidth={52}
                    scrub={preset.scrub}
                    ariaLabel={t("pass3_23.audioDrive.loudValue")}
                  />
                </InspectorRow>
                <InspectorSliderRow
                  label={t("pass3_23.audioDrive.sensitivity")}
                  value={sensitivity}
                  display={sensitivity.toFixed(2)}
                  min={SCRUB_SENSITIVITY.min}
                  max={SCRUB_SENSITIVITY.max}
                  step={SCRUB_SENSITIVITY.step}
                  disabled={pending}
                  onChange={handleSensitivity}
                  origin={1}
                />
                <InspectorRow label={t("pass3_23.audioDrive.attack")}>
                  <InspectorPillInput
                    value={String(attackMs)}
                    onCommit={handleAttack}
                    unit="ms"
                    disabled={pending}
                    scrub={SCRUB_MS}
                    ariaLabel={t("pass3_23.audioDrive.attack")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_23.audioDrive.release")}>
                  <InspectorPillInput
                    value={String(releaseMs)}
                    onCommit={handleRelease}
                    unit="ms"
                    disabled={pending}
                    scrub={SCRUB_MS}
                    ariaLabel={t("pass3_23.audioDrive.release")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_23.audioDrive.offset")}>
                  <InspectorPillInput
                    value={String(offsetMs)}
                    onCommit={handleOffset}
                    unit="ms"
                    disabled={pending}
                    scrub={SCRUB_OFFSET_MS}
                    ariaLabel={t("pass3_23.audioDrive.offset")}
                  />
                </InspectorRow>
                <FlexRow align="center" gap={SPACING.sm}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleBake}
                    disabled={audioClipId === ""}
                    loading={pending}
                  >
                    {existing
                      ? t("pass3_23.audioDrive.rebake")
                      : t("pass3_23.audioDrive.animate")}
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
                    label={t("pass3_23.audioDrive.previewLabel", {
                      property: t(`pass3_23.${PROPERTY_LABEL_KEYS[property]}`)
                    })}
                  />
                )}
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);

ClipAudioDrive.displayName = "ClipAudioDrive";
