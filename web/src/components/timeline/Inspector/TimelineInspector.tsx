/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import BlurOnOutlinedIcon from "@mui/icons-material/BlurOnOutlined";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { usePersistedFold } from "./usePersistedFold";
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
import {
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  NodeSelect,
  NodeSlider,
  NodeMenuItem,
  Panel,
  Text,
  Toast
} from "../../ui_primitives";
import { trackTypeAccent } from "../Tracks/trackVisuals";
import {
  ClipIdentityCard,
  InspectorDivider,
  InspectorHeader,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorToggleRow
} from "./InspectorPrimitives";
import {
  formatTimecode,
  parseSeconds,
  parseTimecode
} from "./InspectorPrimitives.helpers";
import { ClipActions } from "./ClipActions";
import { GeneratedClipPanel } from "./GeneratedClipPanel";
import { DirectGenClipPanel } from "./DirectGenClipPanel";

// ── Styles ─────────────────────────────────────────────────────────────────

const containerStyles = css({
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "8px 12px 24px",
  overflow: "auto"
});

const sectionContentStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "4px 0 10px"
});

const inspectorPanelSx = {
  height: "100%",
  maxHeight: "100%",
  minHeight: 0,
  overflow: "auto",
  boxSizing: "border-box"
};

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

// ── Component ──────────────────────────────────────────────────────────────

export const TimelineInspector: React.FC = memo(() => {
  const theme = useTheme();
  const navigate = useNavigate();

  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const clipId = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;
  const selectedCount = selectedClipIds.size;

  // Persisted fold state — closed by default, remembered across selections
  // and reloads via localStorage.
  const [mediaOpen, setMediaOpen] = usePersistedFold("media");
  const [timingOpen, setTimingOpen] = usePersistedFold("timing");
  const [renderOpen, setRenderOpen] = usePersistedFold("render");
  const [transformOpen, setTransformOpen] = usePersistedFold("transform");
  const [colorOpen, setColorOpen] = usePersistedFold("color");
  const [blurOpen, setBlurOpen] = usePersistedFold("blur");
  const [transitionOpen, setTransitionOpen] = usePersistedFold("transition");
  const [actionsOpen, setActionsOpen] = usePersistedFold("actions");

  const clip = useTimelineStore((s) =>
    clipId ? s.clips.find((c) => c.id === clipId) : null
  );
  const track = useTimelineStore((s) =>
    clip ? s.tracks.find((t) => t.id === clip.trackId) : null
  );
  const fps = useTimelineStore((s) => s.fps);
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
  const duplicateSelected = useTimelineStore((s) => s.duplicateSelected);
  const splitClipAtTime = useTimelineStore((s) => s.splitClipAtTime);
  const patchClip = useTimelineStore((s) => s.patchClip);
  const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const [toast, setToast] = useState<string | null>(null);

  const onPatchNumber = useCallback(
    (field: string, raw: string, min?: number, max?: number) => {
      if (!clipId) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const value =
        min != null && max != null ? clamp(parsed, min, max) : parsed;
      patchClip(clipId, { [field]: value });
    },
    [clipId, patchClip]
  );

  const isAudio = clip?.mediaType === "audio";
  const isOverlay = track?.type === "overlay";

  // ── Header action handlers ──────────────────────────────────────────────

  const handleDuplicate = useCallback(() => {
    if (!clipId) return;
    const newIds = duplicateSelected(new Set([clipId]));
    if (newIds.length > 0) setSelection(newIds);
  }, [clipId, duplicateSelected, setSelection]);

  const handleSplitAtPlayhead = useCallback(() => {
    if (!clip) return;
    const at = currentTimeMs;
    if (at > clip.startMs && at < clip.startMs + clip.durationMs) {
      splitClipAtTime(clip.id, at);
    } else {
      setToast("Move the playhead inside the clip to split it.");
    }
  }, [clip, currentTimeMs, splitClipAtTime]);

  const handleDelete = useCallback(() => {
    if (!clipId) return;
    deleteSelected(new Set([clipId]));
    setSelection([]);
  }, [clipId, deleteSelected, setSelection]);

  // ── Identity metadata ───────────────────────────────────────────────────

  const accentColor = useMemo(
    () => (track ? trackTypeAccent(theme, track.type) : undefined),
    [track, theme]
  );

  const identityMeta = useMemo<string[]>(() => {
    if (!clip) return [];
    const parts: string[] = [clip.mediaType];
    const secs = clip.durationMs / 1000;
    parts.push(secs < 10 ? `${secs.toFixed(2)}s` : `${secs.toFixed(1)}s`);
    if (clip.width && clip.height) {
      parts.push(`${clip.width}×${clip.height}`);
    }
    return parts;
  }, [clip]);

  // ── Empty / multi-selection states ──────────────────────────────────────

  if (selectedCount === 0) {
    return (
      <Panel css={containerStyles} sx={inspectorPanelSx}>
        <InspectorHeader eyebrow="Inspector" />
        <EmptyState
          variant="empty"
          size="small"
          title="No selection"
          description="Select a clip on the timeline to edit its properties."
        />
      </Panel>
    );
  }

  if (selectedCount > 1) {
    return (
      <Panel css={containerStyles} sx={inspectorPanelSx}>
        <InspectorHeader
          eyebrow={`${selectedCount} Clips`}
          actions={[
            {
              icon: <DeleteOutlineOutlinedIcon />,
              label: "Delete selection",
              onClick: () => deleteSelected(selectedClipIds),
              variant: "danger"
            }
          ]}
        />
        <Text size="small" sx={{ px: 0.5, color: "text.secondary" }}>
          Multi-clip editing is not yet supported.
        </Text>
      </Panel>
    );
  }

  if (!clip) return null;

  // Direct-gen and workflow-bound generated clips keep their bespoke panels.
  if (clip.sourceType === "generated") {
    if (
      clip.bindingKind === "text-to-image" ||
      clip.bindingKind === "image-to-image" ||
      clip.bindingKind === "text-to-video" ||
      clip.bindingKind === "text-to-audio"
    ) {
      return <DirectGenClipPanel clipId={clip.id} />;
    }
    return <GeneratedClipPanel clipId={clip.id} />;
  }

  // ── Imported-clip inspector ─────────────────────────────────────────────

  return (
    <Panel css={containerStyles} sx={inspectorPanelSx}>
      <InspectorHeader
        eyebrow="Clip"
        actions={[
          {
            icon: <AddIcon />,
            label: "Duplicate clip",
            onClick: handleDuplicate
          },
          {
            icon: <ContentCutOutlinedIcon />,
            label: "Split at playhead",
            onClick: handleSplitAtPlayhead
          },
          {
            icon: <DeleteOutlineOutlinedIcon />,
            label: "Delete clip",
            onClick: handleDelete,
            variant: "danger"
          }
        ]}
      />

      <ClipIdentityCard
        name={clip.name}
        metadata={identityMeta}
        accentColor={accentColor}
      />

      <CollapsibleSection
        title={<InspectorSectionTitle title="Media" />}
        open={mediaOpen}
        onToggle={setMediaOpen}
      >
        <FlexColumn css={sectionContentStyles}>
          <InspectorRow label="Type">
            <InspectorPillInput
              value={clip.mediaType}
              onCommit={() => {
                /* read-only — committed on change elsewhere */
              }}
              disabled
              ariaLabel="Media type"
            />
          </InspectorRow>
          <InspectorRow label="Asset">
            <Text size="small" sx={{ color: "text.secondary" }}>
              {clip.currentAssetId ?? "—"}
            </Text>
          </InspectorRow>
        </FlexColumn>
      </CollapsibleSection>

      <InspectorDivider />

      <CollapsibleSection
        title={<InspectorSectionTitle title="Timing" />}
        open={timingOpen}
        onToggle={setTimingOpen}
      >
        <FlexColumn css={sectionContentStyles}>
          <InspectorRow label="Start">
            <InspectorPillInput
              value={formatTimecode(clip.startMs, fps)}
              onCommit={(raw) => {
                const ms = parseTimecode(raw, fps);
                if (ms == null) return;
                patchClip(clip.id, { startMs: Math.max(0, ms) });
              }}
              minWidth={112}
              ariaLabel="Start timecode"
            />
          </InspectorRow>
          <InspectorRow label="Duration">
            <InspectorPillInput
              value={(clip.durationMs / 1000).toFixed(2)}
              unit="s"
              onCommit={(raw) => {
                const ms = parseSeconds(raw);
                if (ms == null || ms < 1) return;
                patchClip(clip.id, { durationMs: ms });
              }}
              ariaLabel="Duration in seconds"
            />
          </InspectorRow>
          <InspectorRow label="Speed">
            <InspectorPillInput
              value={(clip.speedMultiplier ?? 1).toFixed(2)}
              unit="×"
              onCommit={(raw) =>
                onPatchNumber("speedMultiplier", raw, 0.1, 8)
              }
              ariaLabel="Playback speed"
            />
          </InspectorRow>
          <InspectorToggleRow
            label="Hidden"
            checked={!!clip.hidden}
            onChange={(next) => patchClip(clip.id, { hidden: next })}
          />
        </FlexColumn>
      </CollapsibleSection>

      <InspectorDivider />

      <CollapsibleSection
        title={<InspectorSectionTitle title="Render" />}
        open={renderOpen}
        onToggle={setRenderOpen}
      >
        <FlexColumn css={sectionContentStyles}>
          {!isAudio && (
            <InspectorRow label="Opacity">
              <NodeSlider
                min={0}
                max={1}
                step={0.01}
                value={clip.opacity ?? 1}
                onChange={(_e, value) =>
                  patchClip(clip.id, {
                    opacity: Array.isArray(value) ? value[0] : value
                  })
                }
              />
            </InspectorRow>
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
            title={<InspectorSectionTitle title="Transform" />}
            open={transformOpen}
            onToggle={setTransformOpen}
          >
            <FlexColumn css={sectionContentStyles}>
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
                    <InspectorRow label="X">
                      <InspectorPillInput
                        value={t.position.x.toFixed(0)}
                        unit="px"
                        onCommit={(raw) => {
                          const n = Number(raw);
                          if (Number.isFinite(n)) setPos("x", n);
                        }}
                        ariaLabel="Position X"
                      />
                    </InspectorRow>
                    <InspectorRow label="Y">
                      <InspectorPillInput
                        value={t.position.y.toFixed(0)}
                        unit="px"
                        onCommit={(raw) => {
                          const n = Number(raw);
                          if (Number.isFinite(n)) setPos("y", n);
                        }}
                        ariaLabel="Position Y"
                      />
                    </InspectorRow>
                    <InspectorRow label="Scale X">
                      <InspectorPillInput
                        value={t.scale.x.toFixed(2)}
                        unit="×"
                        onCommit={(raw) => {
                          const n = Number(raw);
                          if (Number.isFinite(n)) setScale("x", n);
                        }}
                        ariaLabel="Scale X"
                      />
                    </InspectorRow>
                    <InspectorRow label="Scale Y">
                      <InspectorPillInput
                        value={t.scale.y.toFixed(2)}
                        unit="×"
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
                    <InspectorRow label={`Anchor X (${t.anchor.x.toFixed(2)})`}>
                      <NodeSlider
                        min={0}
                        max={1}
                        step={0.01}
                        value={t.anchor.x}
                        onChange={(_e, value) =>
                          setAnchor("x", Array.isArray(value) ? value[0] : value)
                        }
                      />
                    </InspectorRow>
                    <InspectorRow label={`Anchor Y (${t.anchor.y.toFixed(2)})`}>
                      <NodeSlider
                        min={0}
                        max={1}
                        step={0.01}
                        value={t.anchor.y}
                        onChange={(_e, value) =>
                          setAnchor("y", Array.isArray(value) ? value[0] : value)
                        }
                      />
                    </InspectorRow>
                    <InspectorRow label="Radius">
                      <NodeSlider
                        min={0}
                        max={500}
                        step={1}
                        value={clip.borderRadius ?? 0}
                        onChange={(_e, value) =>
                          patchClip(clip.id, {
                            borderRadius: Array.isArray(value)
                              ? value[0]
                              : value
                          })
                        }
                      />
                    </InspectorRow>
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
            <FlexColumn css={sectionContentStyles}>
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
                  defaultV: number
                ) => {
                  const v = color?.[key] ?? defaultV;
                  return (
                    <InspectorRow label={`${label} (${v.toFixed(2)})`}>
                      <NodeSlider
                        min={min}
                        max={max}
                        step={step}
                        value={v}
                        disabled={!enabled}
                        onChange={(_e, value) =>
                          update({
                            [key]: Array.isArray(value) ? value[0] : value
                          } as Partial<ClipColorEffect>)
                        }
                      />
                    </InspectorRow>
                  );
                };
                return (
                  <>
                    <InspectorToggleRow
                      label="Enable"
                      checked={enabled}
                      onChange={(next) => update({ enabled: next })}
                    />
                    {slider("Brightness", "brightness", -1, 1, 0.01, 0)}
                    {slider("Contrast", "contrast", 0, 4, 0.01, 1)}
                    {slider("Saturation", "saturation", 0, 4, 0.01, 1)}
                    {slider("Hue", "hue", -180, 180, 1, 0)}
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
            <FlexColumn css={sectionContentStyles}>
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
                      label="Enable"
                      checked={enabled}
                      onChange={(next) => updateBlur({ enabled: next })}
                    />
                    <InspectorRow label={`Radius (${radius.toFixed(0)} px)`}>
                      <NodeSlider
                        min={0}
                        max={20}
                        step={0.5}
                        value={radius}
                        disabled={!enabled}
                        onChange={(_e, value) =>
                          updateBlur({
                            radius: Array.isArray(value) ? value[0] : value
                          })
                        }
                      />
                    </InspectorRow>
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
            title={<InspectorSectionTitle title="Transition" />}
            open={transitionOpen}
            onToggle={setTransitionOpen}
          >
            <FlexColumn css={sectionContentStyles}>
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
                        <NodeMenuItem value="crossfade">Crossfade</NodeMenuItem>
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

      <InspectorDivider />

      <CollapsibleSection
        title={<InspectorSectionTitle title="Actions" />}
        open={actionsOpen}
        onToggle={setActionsOpen}
      >
        <FlexColumn css={sectionContentStyles} gap={1}>
          <ClipActions clipId={clip.id} />
          <FlexRow gap={1} sx={{ px: 0.5, flexWrap: "wrap" }}>
            <EditorButton
              size="small"
              onClick={() => setToast("Replace media picker coming soon")}
            >
              Replace media
            </EditorButton>
            <EditorButton
              size="small"
              onClick={() => navigate("/assets")}
            >
              Reveal in library
            </EditorButton>
            <EditorButton
              size="small"
              onClick={() =>
                setToast("Convert to Generated Clip will be wired in NOD-306")
              }
            >
              Convert to generated
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      </CollapsibleSection>

      <Toast
        open={toast !== null}
        message={toast ?? ""}
        onClose={() => setToast(null)}
        severity="info"
      />
    </Panel>
  );
});

TimelineInspector.displayName = "TimelineInspector";
