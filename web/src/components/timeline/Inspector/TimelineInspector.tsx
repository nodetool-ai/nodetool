/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { css } from "@emotion/react";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
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
  FormField,
  LabeledSwitch,
  NodeSelect,
  NodeSlider,
  NodeTextField,
  NodeMenuItem,
  Panel,
  Text,
  Toast
} from "../../ui_primitives";
import { ClipActions } from "./ClipActions";
import { GeneratedClipPanel } from "./GeneratedClipPanel";
import { DirectGenClipPanel } from "./DirectGenClipPanel";

const containerStyles = css({
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: 8,
  overflow: "auto"
});
const sectionContentStyles = css({ padding: 8 });

/** Stable IDs for the inspector-managed effects so they can round-trip in
 *  `clip.effects` without an add/remove UI. Each clip has at most one of each. */
const COLOR_EFFECT_ID = "inspector:color";
const BLUR_EFFECT_ID = "inspector:blur";

const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

/**
 * Numeric field with local draft state — only commits on blur or Enter.
 * Avoids patching the store on every keystroke.
 */
const NumericField: React.FC<{
  label: string;
  value: number | undefined;
  onCommit: (raw: string) => void;
}> = ({ label, value, onCommit }) => {
  const initial = value ?? "";
  const [draft, setDraft] = useState<string>(String(initial));

  // Re-sync when the underlying value changes (e.g. clip selection swap).
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    if (draft === String(value ?? "")) return;
    onCommit(draft);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <FormField label={label}>
      <NodeTextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    </FormField>
  );
};

export const TimelineInspector: React.FC = memo(() => {
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

  const clip = useTimelineStore((s) => (clipId ? s.clips.find((c) => c.id === clipId) : null));
  const track = useTimelineStore((s) => (clip ? s.tracks.find((t) => t.id === clip.trackId) : null));
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
  const patchClip = useTimelineStore((s) => s.patchClip);
  const [toast, setToast] = useState<string | null>(null);

  const onPatchNumber = useCallback((field: string, raw: string, min?: number, max?: number) => {
    if (!clipId) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value = min != null && max != null ? clamp(parsed, min, max) : parsed;
    patchClip(clipId, { [field]: value });
  }, [clipId, patchClip]);

  const isAudio = clip?.mediaType === "audio";
  const isOverlay = track?.type === "overlay";

  if (selectedCount === 0) {
    return <EmptyState variant="empty" size="small" title="Inspector" description="Select a clip to inspect" />;
  }

  if (selectedCount > 1) {
    return (
      <Panel sx={{ width: "100%", p: 1 }}>
        <Text weight={500}>{selectedCount} clips selected</Text>
        <FlexRow gap={1} sx={{ mt: 1 }}>
          <EditorButton onClick={() => deleteSelected(selectedClipIds)}>Delete</EditorButton>
          <EditorButton disabled>Lock</EditorButton>
          <EditorButton disabled>Mute</EditorButton>
        </FlexRow>
      </Panel>
    );
  }

  if (!clip) return null;

  // Direct-gen clips (text-to-image / image-to-image) get the prompt-driven
  // inspector; workflow-bound generated clips get the workflow inputs view.
  if (clip.sourceType === "generated") {
    if (
      clip.bindingKind === "text-to-image" ||
      clip.bindingKind === "image-to-image"
    ) {
      return <DirectGenClipPanel clipId={clip.id} />;
    }
    return <GeneratedClipPanel clipId={clip.id} />;
  }

  return (
    <Panel css={containerStyles}>
      <FlexColumn gap={1}>
        <CollapsibleSection title="Media" open={mediaOpen} onToggle={setMediaOpen}>
          <FlexColumn css={sectionContentStyles} gap={1}>
            <Text size="small">Name: {clip.name}</Text>
            <Text size="small">Type: {clip.mediaType}</Text>
            <Text size="small">Asset: {clip.currentAssetId ?? "—"}</Text>
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Timing" open={timingOpen} onToggle={setTimingOpen}>
          <FlexColumn css={sectionContentStyles} gap={1}>
            <NumericField label="Start (ms)" value={clip.startMs} onCommit={(v) => onPatchNumber("startMs", v, 0, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="Duration (ms)" value={clip.durationMs} onCommit={(v) => onPatchNumber("durationMs", v, 1, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="In point (ms)" value={clip.inPointMs ?? 0} onCommit={(v) => onPatchNumber("inPointMs", v, 0, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="Out point (ms)" value={clip.outPointMs ?? clip.durationMs} onCommit={(v) => onPatchNumber("outPointMs", v, 1, Number.MAX_SAFE_INTEGER)} />
            <NumericField label="Speed" value={clip.speedMultiplier ?? 1} onCommit={(v) => onPatchNumber("speedMultiplier", v, 0.1, 8)} />
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Render" open={renderOpen} onToggle={setRenderOpen}>
          <FlexColumn css={sectionContentStyles} gap={1}>
            {!isAudio && (
              <FormField label="Opacity">
                <NodeSlider min={0} max={1} step={0.01} value={clip.opacity ?? 1} onChange={(_e, value) => patchClip(clip.id, { opacity: Array.isArray(value) ? value[0] : value })} />
              </FormField>
            )}
            {isOverlay && !isAudio && (
              <FormField label="Blend mode">
                <NodeSelect value={clip.blendMode ?? "normal"} onChange={(e) => patchClip(clip.id, { blendMode: e.target.value as BlendMode })}>
                  {BLEND_MODES.map((mode) => <NodeMenuItem key={mode.value} value={mode.value}>{mode.label}</NodeMenuItem>)}
                </NodeSelect>
              </FormField>
            )}
            {isAudio && (
              <>
                <NumericField label="Volume (dB)" value={clip.volumeDb ?? 0} onCommit={(v) => onPatchNumber("volumeDb", v, -60, 12)} />
                <NumericField label="Fade in (ms)" value={clip.fadeInMs ?? 0} onCommit={(v) => onPatchNumber("fadeInMs", v, 0, Math.floor(clip.durationMs / 2))} />
                <NumericField label="Fade out (ms)" value={clip.fadeOutMs ?? 0} onCommit={(v) => onPatchNumber("fadeOutMs", v, 0, Math.floor(clip.durationMs / 2))} />
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>

        {!isAudio && (
          <CollapsibleSection title="Transform" open={transformOpen} onToggle={setTransformOpen}>
            <FlexColumn css={sectionContentStyles} gap={1}>
              {(() => {
                const t = clip.transform ?? IDENTITY_TRANSFORM;
                const setTransform = (next: ClipTransform) =>
                  patchClip(clip.id, { transform: next });
                const setPos = (axis: "x" | "y", v: number) =>
                  setTransform({ ...t, position: { ...t.position, [axis]: v } });
                const setScale = (axis: "x" | "y", v: number) =>
                  setTransform({ ...t, scale: { ...t.scale, [axis]: v } });
                const setAnchor = (axis: "x" | "y", v: number) =>
                  setTransform({ ...t, anchor: { ...t.anchor, [axis]: v } });
                const setRotationDeg = (deg: number) =>
                  setTransform({ ...t, rotation: (deg * Math.PI) / 180 });
                return (
                  <>
                    <NumericField
                      label="X (px)"
                      value={t.position.x}
                      onCommit={(v) => {
                        const n = Number(v);
                        if (Number.isFinite(n)) setPos("x", n);
                      }}
                    />
                    <NumericField
                      label="Y (px)"
                      value={t.position.y}
                      onCommit={(v) => {
                        const n = Number(v);
                        if (Number.isFinite(n)) setPos("y", n);
                      }}
                    />
                    <NumericField
                      label="Scale X"
                      value={t.scale.x}
                      onCommit={(v) => {
                        const n = Number(v);
                        if (Number.isFinite(n)) setScale("x", n);
                      }}
                    />
                    <NumericField
                      label="Scale Y"
                      value={t.scale.y}
                      onCommit={(v) => {
                        const n = Number(v);
                        if (Number.isFinite(n)) setScale("y", n);
                      }}
                    />
                    <NumericField
                      label="Rotation (deg)"
                      value={(t.rotation * 180) / Math.PI}
                      onCommit={(v) => {
                        const n = Number(v);
                        if (Number.isFinite(n)) setRotationDeg(n);
                      }}
                    />
                    <FormField label={`Anchor X (${t.anchor.x.toFixed(2)})`}>
                      <NodeSlider
                        min={0}
                        max={1}
                        step={0.01}
                        value={t.anchor.x}
                        onChange={(_e, value) =>
                          setAnchor("x", Array.isArray(value) ? value[0] : value)
                        }
                      />
                    </FormField>
                    <FormField label={`Anchor Y (${t.anchor.y.toFixed(2)})`}>
                      <NodeSlider
                        min={0}
                        max={1}
                        step={0.01}
                        value={t.anchor.y}
                        onChange={(_e, value) =>
                          setAnchor("y", Array.isArray(value) ? value[0] : value)
                        }
                      />
                    </FormField>
                    <FormField label="Border radius (px)">
                      <NodeSlider
                        min={0}
                        max={500}
                        step={1}
                        value={clip.borderRadius ?? 0}
                        onChange={(_e, value) =>
                          patchClip(clip.id, {
                            borderRadius: Array.isArray(value) ? value[0] : value
                          })
                        }
                      />
                    </FormField>
                    <EditorButton
                      onClick={() =>
                        patchClip(clip.id, {
                          transform: undefined,
                          borderRadius: undefined
                        })
                      }
                    >
                      Reset transform
                    </EditorButton>
                  </>
                );
              })()}
            </FlexColumn>
          </CollapsibleSection>
        )}

        {!isAudio && (
          <CollapsibleSection title="Color" open={colorOpen} onToggle={setColorOpen}>
            <FlexColumn css={sectionContentStyles} gap={1}>
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
                  key: keyof Omit<ClipColorEffect, "id" | "type" | "enabled">,
                  min: number,
                  max: number,
                  step: number,
                  defaultV: number
                ) => {
                  const v = color?.[key] ?? defaultV;
                  return (
                    <FormField label={`${label} (${v.toFixed(2)})`}>
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
                    </FormField>
                  );
                };
                return (
                  <>
                    <LabeledSwitch
                      label="Enable color grading"
                      checked={enabled}
                      onChange={(checked) => update({ enabled: checked })}
                    />
                    {slider("Brightness", "brightness", -1, 1, 0.01, 0)}
                    {slider("Contrast", "contrast", 0, 4, 0.01, 1)}
                    {slider("Saturation", "saturation", 0, 4, 0.01, 1)}
                    {slider("Hue", "hue", -180, 180, 1, 0)}
                    {slider("Temperature", "temperature", -1, 1, 0.01, 0)}
                    {slider("Tint", "tint", -1, 1, 0.01, 0)}
                    {slider("Shadows", "shadows", -1, 1, 0.01, 0)}
                    {slider("Highlights", "highlights", -1, 1, 0.01, 0)}
                    <EditorButton
                      disabled={!color}
                      onClick={() =>
                        patchClip(clip.id, {
                          effects: clip.effects?.filter(
                            (e) => e.id !== COLOR_EFFECT_ID
                          )
                        })
                      }
                    >
                      Clear color effect
                    </EditorButton>
                  </>
                );
              })()}
            </FlexColumn>
          </CollapsibleSection>
        )}

        {!isAudio && (
          <CollapsibleSection title="Blur" open={blurOpen} onToggle={setBlurOpen}>
            <FlexColumn css={sectionContentStyles} gap={1}>
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
                    <LabeledSwitch
                      label="Enable blur"
                      checked={enabled}
                      onChange={(checked) => updateBlur({ enabled: checked })}
                    />
                    <FormField label={`Radius (${radius.toFixed(0)} px)`}>
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
                    </FormField>
                    <EditorButton
                      disabled={!blur}
                      onClick={() =>
                        patchClip(clip.id, {
                          effects: clip.effects?.filter(
                            (e) => e.id !== BLUR_EFFECT_ID
                          )
                        })
                      }
                    >
                      Clear blur effect
                    </EditorButton>
                  </>
                );
              })()}
            </FlexColumn>
          </CollapsibleSection>
        )}

        {!isAudio && (
          <CollapsibleSection title="Transition" open={transitionOpen} onToggle={setTransitionOpen}>
            <FlexColumn css={sectionContentStyles} gap={1}>
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
                    <FormField label="Type">
                      <NodeSelect
                        value={type}
                        onChange={(e) =>
                          setType(e.target.value as "none" | "crossfade")
                        }
                      >
                        <NodeMenuItem value="none">None</NodeMenuItem>
                        <NodeMenuItem value="crossfade">Crossfade</NodeMenuItem>
                      </NodeSelect>
                    </FormField>
                    {type === "crossfade" && (
                      <>
                        <NumericField
                          label="Duration (ms)"
                          value={duration}
                          onCommit={(v) => {
                            const n = Number(v);
                            if (!Number.isFinite(n) || n < 0) return;
                            patchClip(clip.id, {
                              transitionIn: {
                                type: "crossfade",
                                durationMs: Math.max(0, Math.floor(n))
                              }
                            });
                          }}
                        />
                        <Text size="small">
                          Overlap this clip with the previous clip on the same
                          track to see the cross-fade.
                        </Text>
                      </>
                    )}
                  </>
                );
              })()}
            </FlexColumn>
          </CollapsibleSection>
        )}

        <CollapsibleSection title="Actions" open={actionsOpen} onToggle={setActionsOpen}>
          <FlexColumn css={sectionContentStyles} gap={1}>
            <ClipActions clipId={clip.id} />
            <EditorButton onClick={() => setToast("Replace media picker coming soon")}>Replace Media</EditorButton>
            <EditorButton onClick={() => navigate("/assets")}>Reveal in Library</EditorButton>
            <EditorButton onClick={() => setToast("Convert to Generated Clip will be wired in NOD-306")}>Convert to Generated Clip</EditorButton>
          </FlexColumn>
        </CollapsibleSection>

      </FlexColumn>
      <Toast open={toast !== null} message={toast ?? ""} onClose={() => setToast(null)} severity="info" />
    </Panel>
  );
});

TimelineInspector.displayName = "TimelineInspector";
