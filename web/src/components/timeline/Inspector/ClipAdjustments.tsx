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

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import BlurOnOutlinedIcon from "@mui/icons-material/BlurOnOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import OpenWithOutlinedIcon from "@mui/icons-material/OpenWithOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";

import type {
  BlendMode,
  ClipBlurEffect,
  ClipColorEffect,
  ClipEffect,
  ClipTransform,
  ClipTransition,
  TimelineClip
} from "@nodetool-ai/timeline";
import { BLEND_MODES } from "@nodetool-ai/gpu";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  FlexRow,
  NodeSelect,
  NodeMenuItem,
  Text
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSliderRow,
  InspectorToggleRow
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
    padding: theme.spacing(1, 0, 3)
  });

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

    const onPatchNumber = (
      field: string,
      raw: string,
      min?: number,
      max?: number
    ) => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const value =
        min != null && max != null ? clamp(parsed, min, max) : parsed;
      patchClip(clip.id, { [field]: value });
    };

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
                onChange={(value) => patchClip(clip.id, { opacity: value })}
              />
            )}
            {isOverlay && !isAudio && (
              <InspectorRow label="Blend">
                <NodeSelect
                  value={clip.blendMode ?? "normal"}
                  onChange={(e) =>
                    patchClip(clip.id, {
                      blendMode: e.target.value as BlendMode
                    })
                  }
                >
                  {BLEND_MODES.map((mode) => (
                    <NodeMenuItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </NodeMenuItem>
                  ))}
                </NodeSelect>
              </InspectorRow>
            )}
            {isAudio && (
              <>
                <InspectorRow label="Volume">
                  <InspectorPillInput
                    value={(clip.volumeDb ?? 0).toFixed(1)}
                    unit="dB"
                    onCommit={(raw) => onPatchNumber("volumeDb", raw, -60, 12)}
                    ariaLabel="Volume (dB)"
                  />
                </InspectorRow>
                <InspectorRow label="Fade in">
                  <InspectorPillInput
                    value={((clip.fadeInMs ?? 0) / 1000).toFixed(2)}
                    unit="s"
                    onCommit={(raw) => {
                      const ms = parseSeconds(raw);
                      if (ms == null) return;
                      onPatchNumber(
                        "fadeInMs",
                        String(ms),
                        0,
                        Math.floor(clip.durationMs / 2)
                      );
                    }}
                    ariaLabel="Fade in (seconds)"
                  />
                </InspectorRow>
                <InspectorRow label="Fade out">
                  <InspectorPillInput
                    value={((clip.fadeOutMs ?? 0) / 1000).toFixed(2)}
                    unit="s"
                    onCommit={(raw) => {
                      const ms = parseSeconds(raw);
                      if (ms == null) return;
                      onPatchNumber(
                        "fadeOutMs",
                        String(ms),
                        0,
                        Math.floor(clip.durationMs / 2)
                      );
                    }}
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
                />
              }
              open={transformOpen}
              onToggle={setTransformOpen}
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                {(() => {
                  const t = clip.transform ?? IDENTITY_TRANSFORM;
                  const setTransform = (next: ClipTransform) =>
                    patchClip(clip.id, { transform: next });
                  const setPos = (axis: "x" | "y", v: number) =>
                    setTransform({
                      ...t,
                      position: { ...t.position, [axis]: v }
                    });
                  const setScale = (axis: "x" | "y", v: number) =>
                    setTransform({
                      ...t,
                      scale: { ...t.scale, [axis]: v }
                    });
                  const setAnchor = (axis: "x" | "y", v: number) =>
                    setTransform({
                      ...t,
                      anchor: { ...t.anchor, [axis]: v }
                    });
                  const setRotationDeg = (deg: number) =>
                    setTransform({ ...t, rotation: (deg * Math.PI) / 180 });
                  return (
                    <>
                      <InspectorRow label="Position">
                        <InspectorPillInput
                          value={t.position.x.toFixed(0)}
                          unit="px"
                          minWidth={72}
                          onCommit={(raw) => {
                            const n = Number(raw);
                            if (Number.isFinite(n)) setPos("x", n);
                          }}
                          ariaLabel="Position X"
                        />
                        <InspectorPillInput
                          value={t.position.y.toFixed(0)}
                          unit="px"
                          minWidth={72}
                          onCommit={(raw) => {
                            const n = Number(raw);
                            if (Number.isFinite(n)) setPos("y", n);
                          }}
                          ariaLabel="Position Y"
                        />
                      </InspectorRow>
                      <InspectorRow label="Scale">
                        <InspectorPillInput
                          value={t.scale.x.toFixed(2)}
                          unit="×"
                          minWidth={72}
                          onCommit={(raw) => {
                            const n = Number(raw);
                            if (Number.isFinite(n)) setScale("x", n);
                          }}
                          ariaLabel="Scale X"
                        />
                        <InspectorPillInput
                          value={t.scale.y.toFixed(2)}
                          unit="×"
                          minWidth={72}
                          onCommit={(raw) => {
                            const n = Number(raw);
                            if (Number.isFinite(n)) setScale("y", n);
                          }}
                          ariaLabel="Scale Y"
                        />
                      </InspectorRow>
                      <InspectorRow label="Rotation">
                        <InspectorPillInput
                          value={((t.rotation * 180) / Math.PI).toFixed(1)}
                          unit="°"
                          onCommit={(raw) => {
                            const n = Number(raw);
                            if (Number.isFinite(n)) setRotationDeg(n);
                          }}
                          ariaLabel="Rotation in degrees"
                        />
                      </InspectorRow>
                      <InspectorSliderRow
                        label="Anchor X"
                        min={0}
                        max={1}
                        step={0.01}
                        value={t.anchor.x}
                        origin={0.5}
                        display={t.anchor.x.toFixed(2)}
                        onChange={(value) => setAnchor("x", value)}
                      />
                      <InspectorSliderRow
                        label="Anchor Y"
                        min={0}
                        max={1}
                        step={0.01}
                        value={t.anchor.y}
                        origin={0.5}
                        display={t.anchor.y.toFixed(2)}
                        onChange={(value) => setAnchor("y", value)}
                      />
                      <InspectorSliderRow
                        label="Radius"
                        min={0}
                        max={500}
                        step={1}
                        value={clip.borderRadius ?? 0}
                        display={`${(clip.borderRadius ?? 0).toFixed(0)}px`}
                        onChange={(value) =>
                          patchClip(clip.id, { borderRadius: value })
                        }
                      />
                      <FlexRow justify="flex-end" sx={{ mt: 1, px: 0.5 }}>
                        <EditorButton
                          size="small"
                          onClick={() =>
                            patchClip(clip.id, {
                              transform: undefined,
                              borderRadius: undefined
                            })
                          }
                        >
                          Reset transform
                        </EditorButton>
                      </FlexRow>
                    </>
                  );
                })()}
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
                />
              }
              open={colorOpen}
              onToggle={setColorOpen}
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                {(() => {
                  const color = findColorEffect(clip);
                  const enabled = color?.enabled ?? false;
                  const update = (patch: Partial<ClipColorEffect>): void => {
                    const next: ClipColorEffect = {
                      id: COLOR_EFFECT_ID,
                      type: "color",
                      enabled,
                      brightness: color?.brightness,
                      contrast: color?.contrast,
                      saturation: color?.saturation,
                      hue: color?.hue,
                      temperature: color?.temperature,
                      tint: color?.tint,
                      shadows: color?.shadows,
                      highlights: color?.highlights,
                      ...patch
                    };
                    patchClip(clip.id, {
                      effects: upsertEffect(clip.effects, next)
                    });
                  };
                  const slider = (
                    label: string,
                    key: keyof Omit<
                      ClipColorEffect,
                      "id" | "type" | "enabled"
                    >,
                    min: number,
                    max: number,
                    step: number,
                    defaultV: number,
                    format: (v: number) => string = (v) => v.toFixed(2)
                  ) => {
                    const v = color?.[key] ?? defaultV;
                    return (
                      <InspectorSliderRow
                        label={label}
                        min={min}
                        max={max}
                        step={step}
                        value={v}
                        origin={defaultV}
                        display={format(v)}
                        disabled={!enabled}
                        onChange={(value) =>
                          update({ [key]: value } as Partial<ClipColorEffect>)
                        }
                      />
                    );
                  };
                  return (
                    <>
                      <InspectorToggleRow
                        label="Enabled"
                        checked={enabled}
                        onChange={(next) => update({ enabled: next })}
                      />
                      {slider("Brightness", "brightness", -1, 1, 0.01, 0)}
                      {slider("Contrast", "contrast", 0, 4, 0.01, 1)}
                      {slider("Saturation", "saturation", 0, 4, 0.01, 1)}
                      {slider("Hue", "hue", -180, 180, 1, 0, (v) =>
                        `${v.toFixed(0)}°`
                      )}
                      {slider("Temperature", "temperature", -1, 1, 0.01, 0)}
                      {slider("Tint", "tint", -1, 1, 0.01, 0)}
                      {slider("Shadows", "shadows", -1, 1, 0.01, 0)}
                      {slider("Highlights", "highlights", -1, 1, 0.01, 0)}
                      <FlexRow justify="flex-end" sx={{ mt: 1, px: 0.5 }}>
                        <EditorButton
                          size="small"
                          disabled={!color}
                          onClick={() =>
                            patchClip(clip.id, {
                              effects: clip.effects?.filter(
                                (e) => e.id !== COLOR_EFFECT_ID
                              )
                            })
                          }
                        >
                          Clear color
                        </EditorButton>
                      </FlexRow>
                    </>
                  );
                })()}
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
                />
              }
              open={blurOpen}
              onToggle={setBlurOpen}
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                {(() => {
                  const blur = findBlurEffect(clip);
                  const enabled = blur?.enabled ?? false;
                  const radius = blur?.radius ?? 0;
                  const updateBlur = (patch: Partial<ClipBlurEffect>) => {
                    const next: ClipBlurEffect = {
                      id: BLUR_EFFECT_ID,
                      type: "blur",
                      enabled,
                      radius,
                      sigma: blur?.sigma,
                      ...patch
                    };
                    patchClip(clip.id, {
                      effects: upsertEffect(clip.effects, next)
                    });
                  };
                  return (
                    <>
                      <InspectorToggleRow
                        label="Enabled"
                        checked={enabled}
                        onChange={(next) => updateBlur({ enabled: next })}
                      />
                      <InspectorSliderRow
                        label="Radius"
                        min={0}
                        max={20}
                        step={0.5}
                        value={radius}
                        display={`${radius.toFixed(0)}px`}
                        disabled={!enabled}
                        onChange={(value) => updateBlur({ radius: value })}
                      />
                      <FlexRow justify="flex-end" sx={{ mt: 1, px: 0.5 }}>
                        <EditorButton
                          size="small"
                          disabled={!blur}
                          onClick={() =>
                            patchClip(clip.id, {
                              effects: clip.effects?.filter(
                                (e) => e.id !== BLUR_EFFECT_ID
                              )
                            })
                          }
                        >
                          Clear blur
                        </EditorButton>
                      </FlexRow>
                    </>
                  );
                })()}
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
            >
              <FlexColumn css={sectionContentStyles(theme)}>
                {(() => {
                  const t = clip.transitionIn;
                  const type: "none" | "crossfade" = t?.type ?? "none";
                  const duration = t?.durationMs ?? 500;
                  const setType = (next: "none" | "crossfade") => {
                    if (next === "none") {
                      patchClip(clip.id, { transitionIn: undefined });
                    } else {
                      const transition: ClipTransition = {
                        type: "crossfade",
                        durationMs: duration
                      };
                      patchClip(clip.id, { transitionIn: transition });
                    }
                  };
                  return (
                    <>
                      <InspectorRow label="Type">
                        <NodeSelect
                          value={type}
                          onChange={(e) =>
                            setType(e.target.value as "none" | "crossfade")
                          }
                        >
                          <NodeMenuItem value="none">None</NodeMenuItem>
                          <NodeMenuItem value="crossfade">
                            Crossfade
                          </NodeMenuItem>
                        </NodeSelect>
                      </InspectorRow>
                      {type === "crossfade" && (
                        <>
                          <InspectorRow label="Duration">
                            <InspectorPillInput
                              value={(duration / 1000).toFixed(2)}
                              unit="s"
                              onCommit={(raw) => {
                                const ms = parseSeconds(raw);
                                if (ms == null) return;
                                patchClip(clip.id, {
                                  transitionIn: {
                                    type: "crossfade",
                                    durationMs: Math.max(0, ms)
                                  }
                                });
                              }}
                              ariaLabel="Transition duration"
                            />
                          </InspectorRow>
                          <Text
                            size="small"
                            sx={{ px: 0.5, color: "text.secondary" }}
                          >
                            Overlap with the previous clip on the same track to
                            see the cross-fade.
                          </Text>
                        </>
                      )}
                    </>
                  );
                })()}
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}
      </>
    );
  }
);

ClipAdjustments.displayName = "ClipAdjustments";
