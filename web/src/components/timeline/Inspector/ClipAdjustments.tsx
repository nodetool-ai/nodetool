/** @jsxImportSource @emotion/react */
/**
 * ClipAdjustments
 *
 * Playback adjustments shared by imported and generated clips. Audio and MIDI
 * clips get Audio controls because both travel through AudioGraph. Clips that
 * draw pixels get Render, Transform, Color, Blur, Effects, Mask, Matte, and
 * Transition controls because those fields are applied by the compositor.
 *
 * Section fold state is persisted (shared keys with the rest of the inspector)
 * so a panel stays open/closed across selections.
 */

import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import BlurOnOutlinedIcon from "@mui/icons-material/BlurOnOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import OpenWithOutlinedIcon from "@mui/icons-material/OpenWithOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";

import type {
  BlendMode,
  ClipBlurEffect,
  ClipColorEffect,
  ClipCrop,
  ClipEffect,
  ClipTransform,
  TimelineClip
} from "@nodetool-ai/timeline";
import { hasCrop, isCropUsable } from "@nodetool-ai/timeline";
import { BLEND_MODES } from "@nodetool-ai/gpu";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  CollapsibleSection,
  FlexColumn,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  InspectorToggleRow
} from "./InspectorPrimitives";
import { parseSeconds } from "./InspectorPrimitives.helpers";
import { ClipEffectsList } from "./ClipEffectsList";
import { ClipMaskMatte } from "./ClipMaskMatte";
import { ClipTransitionSection } from "./ClipTransitionSection";

// ── Effect IDs ─────────────────────────────────────────────────────────────

/** Stable IDs so the inspector-owned effects round-trip in `clip.effects`. */
const COLOR_EFFECT_ID = "inspector:color";
const BLUR_EFFECT_ID = "inspector:blur";

const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

const NO_CROP: ClipCrop = { left: 0, right: 0, top: 0, bottom: 0 };

/** The edge opposite each one, which is what limits how far it can be dragged. */
const CROP_OPPOSITE: Record<keyof ClipCrop, keyof ClipCrop> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top"
};

/**
 * How far this edge can come in before the pair keeps no picture. Stopping a
 * few percent short leaves a sliver to drag back from — a slider pinned at the
 * exact limit has nowhere to go but out.
 */
function cropMax(crop: ClipCrop, edge: keyof ClipCrop): number {
  return Math.max(0, 0.95 - crop[CROP_OPPOSITE[edge]]);
}

const cropDisplay = (value: number) => `${Math.round(value * 100)}%`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function findColorEffect(clip: TimelineClip): ClipColorEffect | undefined {
  return clip.effects?.find(
    (e): e is ClipColorEffect => e.type === "color" && e.id === COLOR_EFFECT_ID
  );
}
function findBlurEffect(clip: TimelineClip): ClipBlurEffect | undefined {
  return clip.effects?.find(
    (e): e is ClipBlurEffect => e.type === "blur" && e.id === BLUR_EFFECT_ID
  );
}
function upsertEffect(
  effects: ClipEffect[] | undefined,
  next: ClipEffect
): ClipEffect[] {
  const existing = effects ?? [];
  const idx = existing.findIndex((e) => e.id === next.id);
  if (idx >= 0) {
    const out = [...existing];
    out[idx] = next;
    return out;
  }
  return [...existing, next];
}

// ── Styles ─────────────────────────────────────────────────────────────────

const sectionContentStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.micro),
    padding: theme.spacing(SPACING.micro, SPACING.none, SPACING.md)
  });

// Hoisted so InspectorPillInput's memo holds: an inline literal would be a
// fresh reference every render, re-rendering every pill whenever one changed.
const SCRUB_SECONDS = { step: 0.02, min: 0 };
const SCRUB_PIXELS = { step: 1 };
const SCRUB_SCALE = { step: 0.01 };
const SCRUB_DEGREES = { step: 0.5 };

// ── Component ──────────────────────────────────────────────────────────────

interface ClipAdjustmentsProps {
  clip: TimelineClip;
}

/**
 * Audio controls for audio and midi clips. Visual clips instead get Render,
 * Transform, Color, Blur, Effects, Mask, Matte and Transition sections.
 * Leads with an {@link InspectorDivider}; the caller supplies the trailing one.
 */
export const ClipAdjustments: React.FC<ClipAdjustmentsProps> = memo(
  ({ clip }) => {
    const theme = useTheme();
    const patchClip = useTimelineStore((s) => s.patchClip);

    const [renderOpen, setRenderOpen] = usePersistedFold("render");
    const [transformOpen, setTransformOpen] = usePersistedFold("transform");
    const [colorOpen, setColorOpen] = usePersistedFold("color");
    const [blurOpen, setBlurOpen] = usePersistedFold("blur");

    const isSounding =
      clip.mediaType === "audio" || clip.mediaType === "midi";
    const isMidi = clip.mediaType === "midi";
    const isOverlay = clip.mediaType === "overlay";

    // Latest-clip ref: lets the handlers below stay referentially stable
    // across re-renders of the same clip (deps keyed on clip.id, not on
    // `clip` itself) while still merging onto its current fields — otherwise
    // every memoized row (InspectorSliderRow, InspectorPillInput…) would
    // re-render on every keystroke in any other row, since a handler that
    // closed over `clip` directly gets a new identity on every patch.
    const clipRef = useRef(clip);
    clipRef.current = clip;

    const onPatchNumber = useCallback(
      (field: string, raw: string, min?: number, max?: number) => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const value =
          min != null && max != null ? clamp(parsed, min, max) : parsed;
        patchClip(clipRef.current.id, { [field]: value });
      },
      [patchClip]
    );

    // ── Render section ─────────────────────────────────────────────────────

    const handleOpacityChange = useCallback(
      (value: number) => patchClip(clip.id, { opacity: value }),
      [clip.id, patchClip]
    );
    const handleBlendModeChange = useCallback(
      (value: string) => patchClip(clip.id, { blendMode: value as BlendMode }),
      [clip.id, patchClip]
    );
    const handleVolumeChange = useCallback(
      (value: number) => patchClip(clip.id, { volumeDb: value }),
      [clip.id, patchClip]
    );
    const handleMutedChange = useCallback(
      (next: boolean) => patchClip(clip.id, { muted: next }),
      [clip.id, patchClip]
    );
    const handleFadeInCommit = useCallback(
      (raw: string) => {
        const ms = parseSeconds(raw);
        if (ms == null) return;
        onPatchNumber(
          "fadeInMs",
          String(ms),
          0,
          Math.floor(clipRef.current.durationMs / 2)
        );
      },
      [onPatchNumber]
    );
    const handleFadeOutCommit = useCallback(
      (raw: string) => {
        const ms = parseSeconds(raw);
        if (ms == null) return;
        onPatchNumber(
          "fadeOutMs",
          String(ms),
          0,
          Math.floor(clipRef.current.durationMs / 2)
        );
      },
      [onPatchNumber]
    );

    // ── Transform section ──────────────────────────────────────────────────

    const setTransform = useCallback(
      (next: ClipTransform) => patchClip(clip.id, { transform: next }),
      [clip.id, patchClip]
    );
    const handlePositionXCommit = useCallback(
      (raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, position: { ...t.position, x: n } });
      },
      [setTransform]
    );
    const handlePositionYCommit = useCallback(
      (raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, position: { ...t.position, y: n } });
      },
      [setTransform]
    );
    const handleScaleXCommit = useCallback(
      (raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, scale: { ...t.scale, x: n } });
      },
      [setTransform]
    );
    const handleScaleYCommit = useCallback(
      (raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, scale: { ...t.scale, y: n } });
      },
      [setTransform]
    );
    const handleRotationCommit = useCallback(
      (raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, rotation: (n * Math.PI) / 180 });
      },
      [setTransform]
    );
    const handleAnchorXChange = useCallback(
      (value: number) => {
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, anchor: { ...t.anchor, x: value } });
      },
      [setTransform]
    );
    const handleAnchorYChange = useCallback(
      (value: number) => {
        const t = clipRef.current.transform ?? IDENTITY_TRANSFORM;
        setTransform({ ...t, anchor: { ...t.anchor, y: value } });
      },
      [setTransform]
    );
    const handleBorderRadiusChange = useCallback(
      (value: number) => patchClip(clip.id, { borderRadius: value }),
      [clip.id, patchClip]
    );
    // A crop is stored as four insets, so one slider writes one edge and leaves
    // the other three alone. Dragging an edge past what its opposite leaves is
    // refused by the slider's own max rather than by a validation message: the
    // pair has to keep some picture between them.
    const setCropEdge = useCallback(
      (edge: keyof ClipCrop, value: number) => {
        const current = clipRef.current.crop ?? NO_CROP;
        const next = { ...current, [edge]: value };
        patchClip(clipRef.current.id, {
          crop: isCropUsable(next) && hasCrop(next) ? next : undefined
        });
      },
      [patchClip]
    );
    const handleCropLeftChange = useCallback(
      (v: number) => setCropEdge("left", v),
      [setCropEdge]
    );
    const handleCropRightChange = useCallback(
      (v: number) => setCropEdge("right", v),
      [setCropEdge]
    );
    const handleCropTopChange = useCallback(
      (v: number) => setCropEdge("top", v),
      [setCropEdge]
    );
    const handleCropBottomChange = useCallback(
      (v: number) => setCropEdge("bottom", v),
      [setCropEdge]
    );
    const handleResetTransform = useCallback(
      () =>
        patchClip(clip.id, {
          transform: undefined,
          borderRadius: undefined,
          crop: undefined
        }),
      [clip.id, patchClip]
    );

    // ── Color section ──────────────────────────────────────────────────────

    const updateColor = useCallback(
      (patch: Partial<ClipColorEffect>): void => {
        const current = findColorEffect(clipRef.current);
        const next: ClipColorEffect = {
          id: COLOR_EFFECT_ID,
          type: "color",
          enabled: current?.enabled ?? false,
          brightness: current?.brightness,
          contrast: current?.contrast,
          saturation: current?.saturation,
          hue: current?.hue,
          temperature: current?.temperature,
          tint: current?.tint,
          shadows: current?.shadows,
          highlights: current?.highlights,
          ...patch
        };
        patchClip(clipRef.current.id, {
          effects: upsertEffect(clipRef.current.effects, next)
        });
      },
      [patchClip]
    );
    const handleColorEnabledChange = useCallback(
      (next: boolean) => updateColor({ enabled: next }),
      [updateColor]
    );
    const handleBrightnessChange = useCallback(
      (value: number) => updateColor({ brightness: value }),
      [updateColor]
    );
    const handleContrastChange = useCallback(
      (value: number) => updateColor({ contrast: value }),
      [updateColor]
    );
    const handleSaturationChange = useCallback(
      (value: number) => updateColor({ saturation: value }),
      [updateColor]
    );
    const handleHueChange = useCallback(
      (value: number) => updateColor({ hue: value }),
      [updateColor]
    );
    const handleTemperatureChange = useCallback(
      (value: number) => updateColor({ temperature: value }),
      [updateColor]
    );
    const handleTintChange = useCallback(
      (value: number) => updateColor({ tint: value }),
      [updateColor]
    );
    const handleShadowsChange = useCallback(
      (value: number) => updateColor({ shadows: value }),
      [updateColor]
    );
    const handleHighlightsChange = useCallback(
      (value: number) => updateColor({ highlights: value }),
      [updateColor]
    );
    const handleClearColor = useCallback(
      () =>
        patchClip(clipRef.current.id, {
          effects: clipRef.current.effects?.filter(
            (e) => e.id !== COLOR_EFFECT_ID
          )
        }),
      [patchClip]
    );

    // ── Blur section ───────────────────────────────────────────────────────

    const updateBlur = useCallback(
      (patch: Partial<ClipBlurEffect>) => {
        const current = findBlurEffect(clipRef.current);
        const next: ClipBlurEffect = {
          id: BLUR_EFFECT_ID,
          type: "blur",
          enabled: current?.enabled ?? false,
          radius: current?.radius ?? 0,
          sigma: current?.sigma,
          ...patch
        };
        patchClip(clipRef.current.id, {
          effects: upsertEffect(clipRef.current.effects, next)
        });
      },
      [patchClip]
    );
    const handleBlurEnabledChange = useCallback(
      (next: boolean) => updateBlur({ enabled: next }),
      [updateBlur]
    );
    const handleBlurRadiusChange = useCallback(
      (value: number) => updateBlur({ radius: value }),
      [updateBlur]
    );
    const handleClearBlur = useCallback(
      () =>
        patchClip(clipRef.current.id, {
          effects: clipRef.current.effects?.filter(
            (e) => e.id !== BLUR_EFFECT_ID
          )
        }),
      [patchClip]
    );

    // ── Derived display values ──────────────────────────────────────────────

    const transform = clip.transform ?? IDENTITY_TRANSFORM;
    const crop = clip.crop ?? NO_CROP;
    const color = findColorEffect(clip);
    const colorEnabled = color?.enabled ?? false;
    const blur = findBlurEffect(clip);
    const blurEnabled = blur?.enabled ?? false;
    const blurRadius = blur?.radius ?? 0;

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={isSounding ? "Audio" : "Render"}
              icon={
                isSounding ? <VolumeUpOutlinedIcon /> : <LayersOutlinedIcon />
              }
            />
          }
          open={renderOpen}
          onToggle={setRenderOpen}
          unmountOnExit
        >
          <FlexColumn css={sectionContentStyles(theme)}>
            {!isSounding && (
              <InspectorSliderRow
                label="Opacity"
                min={0}
                max={1}
                step={0.01}
                value={clip.opacity ?? 1}
                display={`${Math.round((clip.opacity ?? 1) * 100)}%`}
                onChange={handleOpacityChange}
              />
            )}
            {isOverlay && !isSounding && (
              <InspectorRow label="Blend">
                <InspectorSelect
                  label="Blend mode"
                  value={clip.blendMode ?? "normal"}
                  options={BLEND_MODES}
                  onChange={handleBlendModeChange}
                />
              </InspectorRow>
            )}
            {isSounding && (
              <>
                {isMidi && (
                  <InspectorToggleRow
                    label="Mute"
                    checked={!!clip.muted}
                    onChange={handleMutedChange}
                  />
                )}
                <InspectorSliderRow
                  label="Volume"
                  min={-60}
                  max={12}
                  step={0.5}
                  value={clip.volumeDb ?? 0}
                  origin={0}
                  display={`${(clip.volumeDb ?? 0).toFixed(1)} dB`}
                  onChange={handleVolumeChange}
                />
                <InspectorRow label="Fade in">
                  <InspectorPillInput
                    value={((clip.fadeInMs ?? 0) / 1000).toFixed(2)}
                    unit="s"
                    scrub={SCRUB_SECONDS}
                    onCommit={handleFadeInCommit}
                    ariaLabel="Fade in (seconds)"
                  />
                </InspectorRow>
                <InspectorRow label="Fade out">
                  <InspectorPillInput
                    value={((clip.fadeOutMs ?? 0) / 1000).toFixed(2)}
                    unit="s"
                    scrub={SCRUB_SECONDS}
                    onCommit={handleFadeOutCommit}
                    ariaLabel="Fade out (seconds)"
                  />
                </InspectorRow>
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>

        {!isSounding && (
          <>
            <InspectorDivider />
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title="Transform"
                  icon={<OpenWithOutlinedIcon />}
                  action={{
                    icon: <RestartAltOutlinedIcon />,
                    label: "Reset transform",
                    onClick: handleResetTransform
                  }}
                />
              }
              open={transformOpen}
              onToggle={setTransformOpen}
              unmountOnExit
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                <InspectorRow label="Position">
                  <InspectorPillInput
                    value={transform.position.x.toFixed(0)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PIXELS}
                    onCommit={handlePositionXCommit}
                    ariaLabel="Position X"
                  />
                  <InspectorPillInput
                    value={transform.position.y.toFixed(0)}
                    unit="px"
                    minWidth={64}
                    scrub={SCRUB_PIXELS}
                    onCommit={handlePositionYCommit}
                    ariaLabel="Position Y"
                  />
                </InspectorRow>
                <InspectorRow label="Scale">
                  <InspectorPillInput
                    value={transform.scale.x.toFixed(2)}
                    unit="×"
                    minWidth={64}
                    scrub={SCRUB_SCALE}
                    onCommit={handleScaleXCommit}
                    ariaLabel="Scale X"
                  />
                  <InspectorPillInput
                    value={transform.scale.y.toFixed(2)}
                    unit="×"
                    minWidth={64}
                    scrub={SCRUB_SCALE}
                    onCommit={handleScaleYCommit}
                    ariaLabel="Scale Y"
                  />
                </InspectorRow>
                <InspectorRow label="Rotation">
                  <InspectorPillInput
                    value={((transform.rotation * 180) / Math.PI).toFixed(1)}
                    unit="°"
                    scrub={SCRUB_DEGREES}
                    onCommit={handleRotationCommit}
                    ariaLabel="Rotation in degrees"
                  />
                </InspectorRow>
                <InspectorSliderRow
                  label="Anchor X"
                  min={0}
                  max={1}
                  step={0.01}
                  value={transform.anchor.x}
                  origin={0.5}
                  display={transform.anchor.x.toFixed(2)}
                  onChange={handleAnchorXChange}
                />
                <InspectorSliderRow
                  label="Anchor Y"
                  min={0}
                  max={1}
                  step={0.01}
                  value={transform.anchor.y}
                  origin={0.5}
                  display={transform.anchor.y.toFixed(2)}
                  onChange={handleAnchorYChange}
                />
                <InspectorSliderRow
                  label="Radius"
                  min={0}
                  max={500}
                  step={1}
                  value={clip.borderRadius ?? 0}
                  display={`${(clip.borderRadius ?? 0).toFixed(0)}px`}
                  onChange={handleBorderRadiusChange}
                />
                <InspectorDivider />
                <InspectorSliderRow
                  label="Crop L"
                  min={0}
                  max={cropMax(crop, "left")}
                  step={0.005}
                  value={crop.left}
                  display={cropDisplay(crop.left)}
                  onChange={handleCropLeftChange}
                />
                <InspectorSliderRow
                  label="Crop R"
                  min={0}
                  max={cropMax(crop, "right")}
                  step={0.005}
                  value={crop.right}
                  display={cropDisplay(crop.right)}
                  onChange={handleCropRightChange}
                />
                <InspectorSliderRow
                  label="Crop T"
                  min={0}
                  max={cropMax(crop, "top")}
                  step={0.005}
                  value={crop.top}
                  display={cropDisplay(crop.top)}
                  onChange={handleCropTopChange}
                />
                <InspectorSliderRow
                  label="Crop B"
                  min={0}
                  max={cropMax(crop, "bottom")}
                  step={0.005}
                  value={crop.bottom}
                  display={cropDisplay(crop.bottom)}
                  onChange={handleCropBottomChange}
                />
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}

        {!isSounding && (
          <>
            <InspectorDivider />
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title="Color"
                  icon={<WbSunnyOutlinedIcon />}
                  checked={colorEnabled}
                  onCheckedChange={handleColorEnabledChange}
                  action={{
                    icon: <RestartAltOutlinedIcon />,
                    label: "Reset color",
                    onClick: handleClearColor,
                    disabled: !color
                  }}
                />
              }
              open={colorOpen}
              onToggle={setColorOpen}
              unmountOnExit
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                <InspectorSliderRow
                  label="Brightness"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={color?.brightness ?? 0}
                  origin={0}
                  display={(color?.brightness ?? 0).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleBrightnessChange}
                />
                <InspectorSliderRow
                  label="Contrast"
                  min={0}
                  max={4}
                  step={0.01}
                  value={color?.contrast ?? 1}
                  origin={1}
                  display={(color?.contrast ?? 1).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleContrastChange}
                />
                <InspectorSliderRow
                  label="Saturation"
                  min={0}
                  max={4}
                  step={0.01}
                  value={color?.saturation ?? 1}
                  origin={1}
                  display={(color?.saturation ?? 1).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleSaturationChange}
                />
                <InspectorSliderRow
                  label="Hue"
                  min={-180}
                  max={180}
                  step={1}
                  value={color?.hue ?? 0}
                  origin={0}
                  display={`${(color?.hue ?? 0).toFixed(0)}°`}
                  disabled={!colorEnabled}
                  onChange={handleHueChange}
                />
                <InspectorSliderRow
                  label="Temperature"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={color?.temperature ?? 0}
                  origin={0}
                  display={(color?.temperature ?? 0).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleTemperatureChange}
                />
                <InspectorSliderRow
                  label="Tint"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={color?.tint ?? 0}
                  origin={0}
                  display={(color?.tint ?? 0).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleTintChange}
                />
                <InspectorSliderRow
                  label="Shadows"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={color?.shadows ?? 0}
                  origin={0}
                  display={(color?.shadows ?? 0).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleShadowsChange}
                />
                <InspectorSliderRow
                  label="Highlights"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={color?.highlights ?? 0}
                  origin={0}
                  display={(color?.highlights ?? 0).toFixed(2)}
                  disabled={!colorEnabled}
                  onChange={handleHighlightsChange}
                />
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}

        {!isSounding && (
          <>
            <InspectorDivider />
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title="Blur"
                  icon={<BlurOnOutlinedIcon />}
                  checked={blurEnabled}
                  onCheckedChange={handleBlurEnabledChange}
                  action={{
                    icon: <RestartAltOutlinedIcon />,
                    label: "Reset blur",
                    onClick: handleClearBlur,
                    disabled: !blur
                  }}
                />
              }
              open={blurOpen}
              onToggle={setBlurOpen}
              unmountOnExit
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                <InspectorSliderRow
                  label="Radius"
                  min={0}
                  max={20}
                  step={0.5}
                  value={blurRadius}
                  display={`${blurRadius.toFixed(0)}px`}
                  disabled={!blurEnabled}
                  onChange={handleBlurRadiusChange}
                />
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}

        {!isSounding && (
          <>
            <ClipEffectsList clip={clip} />
            <ClipMaskMatte clip={clip} />
            <ClipTransitionSection clip={clip} />
          </>
        )}
      </>
    );
  }
);

ClipAdjustments.displayName = "ClipAdjustments";
