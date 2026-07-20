/** @jsxImportSource @emotion/react */
/**
 * ClipAdjustments
 *
 * The visual / playback adjustment sections shared by every clip inspector,
 * imported and generated alike: Render (opacity / blend, or audio volume +
 * fades), Transform, Color, Blur, and Transition. These all operate on plain
 * `TimelineClip` fields (`opacity`, `transform`, `effects`, `transitionIn`)
 * that the compositor applies regardless of how the clip was produced, so a
 * generated clip can be colour-graded and transformed exactly like an imported
 * one.
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
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";

import type {
  BlendMode,
  ClipBlurEffect,
  ClipColorEffect,
  ClipEffect,
  ClipTransform,
  TimelineClip
} from "@nodetool-ai/timeline";
import { BLEND_MODES } from "@nodetool-ai/gpu";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  CollapsibleSection,
  FlexColumn,
  Text
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow
} from "./InspectorPrimitives";
import { parseSeconds } from "./InspectorPrimitives.helpers";

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
    gap: 2,
    padding: theme.spacing(0.5, 0, 2)
  });

const TRANSITION_MODES = [
  { value: "auto", label: "Auto" },
  { value: "crossfade", label: "Crossfade" },
  { value: "none", label: "None" }
] as const;

// ── Component ──────────────────────────────────────────────────────────────

export interface ClipAdjustmentsProps {
  clip: TimelineClip;
}

/**
 * Render / Transform / Color / Blur / Transition sections for a single clip.
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
    const [transitionOpen, setTransitionOpen] = usePersistedFold("transition");

    const isAudio = clip.mediaType === "audio";
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
    const handleResetTransform = useCallback(
      () =>
        patchClip(clip.id, { transform: undefined, borderRadius: undefined }),
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

    // ── Transition section ─────────────────────────────────────────────────

    const setTransitionMode = useCallback(
      (next: "auto" | "crossfade" | "none") => {
        if (next === "auto") {
          patchClip(clipRef.current.id, { transitionIn: undefined });
        } else if (next === "none") {
          patchClip(clipRef.current.id, {
            transitionIn: { type: "crossfade", durationMs: 0 }
          });
        } else {
          const t = clipRef.current.transitionIn;
          const duration = t && t.durationMs > 0 ? t.durationMs : 500;
          patchClip(clipRef.current.id, {
            transitionIn: { type: "crossfade", durationMs: duration }
          });
        }
      },
      [patchClip]
    );
    const handleTransitionModeChange = useCallback(
      (value: string) =>
        setTransitionMode(value as "auto" | "crossfade" | "none"),
      [setTransitionMode]
    );
    const handleTransitionDurationCommit = useCallback(
      (raw: string) => {
        const ms = parseSeconds(raw);
        if (ms == null) return;
        patchClip(clipRef.current.id, {
          transitionIn: { type: "crossfade", durationMs: Math.max(0, ms) }
        });
      },
      [patchClip]
    );

    // ── Derived display values ──────────────────────────────────────────────

    const transform = clip.transform ?? IDENTITY_TRANSFORM;
    const color = findColorEffect(clip);
    const colorEnabled = color?.enabled ?? false;
    const blur = findBlurEffect(clip);
    const blurEnabled = blur?.enabled ?? false;
    const blurRadius = blur?.radius ?? 0;
    const transitionMode: "auto" | "crossfade" | "none" =
      clip.transitionIn == null
        ? "auto"
        : clip.transitionIn.durationMs <= 0
          ? "none"
          : "crossfade";
    const transitionDuration =
      clip.transitionIn && clip.transitionIn.durationMs > 0
        ? clip.transitionIn.durationMs
        : 500;

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Render"
              icon={<LayersOutlinedIcon />}
            />
          }
          open={renderOpen}
          onToggle={setRenderOpen}
          unmountOnExit
        >
          <FlexColumn css={sectionContentStyles(theme)}>
            {!isAudio && (
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
            {isOverlay && !isAudio && (
              <InspectorRow label="Blend">
                <InspectorSelect
                  label="Blend mode"
                  value={clip.blendMode ?? "normal"}
                  options={BLEND_MODES}
                  onChange={handleBlendModeChange}
                />
              </InspectorRow>
            )}
            {isAudio && (
              <>
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
                    scrub={{ step: 0.02, min: 0 }}
                    onCommit={handleFadeInCommit}
                    ariaLabel="Fade in (seconds)"
                  />
                </InspectorRow>
                <InspectorRow label="Fade out">
                  <InspectorPillInput
                    value={((clip.fadeOutMs ?? 0) / 1000).toFixed(2)}
                    unit="s"
                    scrub={{ step: 0.02, min: 0 }}
                    onCommit={handleFadeOutCommit}
                    ariaLabel="Fade out (seconds)"
                  />
                </InspectorRow>
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>

        {!isAudio && (
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
                    scrub={{ step: 1 }}
                    onCommit={handlePositionXCommit}
                    ariaLabel="Position X"
                  />
                  <InspectorPillInput
                    value={transform.position.y.toFixed(0)}
                    unit="px"
                    minWidth={64}
                    scrub={{ step: 1 }}
                    onCommit={handlePositionYCommit}
                    ariaLabel="Position Y"
                  />
                </InspectorRow>
                <InspectorRow label="Scale">
                  <InspectorPillInput
                    value={transform.scale.x.toFixed(2)}
                    unit="×"
                    minWidth={64}
                    scrub={{ step: 0.01 }}
                    onCommit={handleScaleXCommit}
                    ariaLabel="Scale X"
                  />
                  <InspectorPillInput
                    value={transform.scale.y.toFixed(2)}
                    unit="×"
                    minWidth={64}
                    scrub={{ step: 0.01 }}
                    onCommit={handleScaleYCommit}
                    ariaLabel="Scale Y"
                  />
                </InspectorRow>
                <InspectorRow label="Rotation">
                  <InspectorPillInput
                    value={((transform.rotation * 180) / Math.PI).toFixed(1)}
                    unit="°"
                    scrub={{ step: 0.5 }}
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
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}

        {!isAudio && (
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

        {!isAudio && (
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

        {!isAudio && (
          <>
            <InspectorDivider />
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title="Transition"
                  icon={<CompareArrowsOutlinedIcon />}
                />
              }
              open={transitionOpen}
              onToggle={setTransitionOpen}
              unmountOnExit
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                <InspectorRow label="Type">
                  <InspectorSelect
                    label="Transition type"
                    value={transitionMode}
                    options={TRANSITION_MODES}
                    onChange={handleTransitionModeChange}
                  />
                </InspectorRow>
                {transitionMode === "crossfade" && (
                  <InspectorRow label="Duration">
                    <InspectorPillInput
                      value={(transitionDuration / 1000).toFixed(2)}
                      unit="s"
                      scrub={{ step: 0.02, min: 0 }}
                      onCommit={handleTransitionDurationCommit}
                      ariaLabel="Transition duration"
                    />
                  </InspectorRow>
                )}
                <Text
                  size="small"
                  sx={{ px: 0.5, color: "text.secondary" }}
                >
                  {transitionMode === "auto"
                    ? "Overlap this clip with the previous one on the same track to cross-fade."
                    : transitionMode === "crossfade"
                      ? "Fixed cross-fade length, measured from this clip's start."
                      : "Always a hard cut, even when clips overlap."}
                </Text>
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}
      </>
    );
  }
);

ClipAdjustments.displayName = "ClipAdjustments";
