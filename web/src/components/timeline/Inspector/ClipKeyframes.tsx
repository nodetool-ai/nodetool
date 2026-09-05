/** @jsxImportSource @emotion/react */
/**
 * ClipKeyframes — per-property keyframes at the playhead, the way a stopwatch
 * row works in Premiere's Effect Controls or Final Cut's Video inspector.
 *
 * One row per property: a diamond that adds or removes a keyframe at the
 * playhead, and the value there. Typing a value keyframes it at the playhead.
 * The clip shows its keyframes as diamonds along its bottom edge.
 */
import React, { memo, useCallback } from "react";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";
import DiamondIcon from "@mui/icons-material/Diamond";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";

import {
  KEYFRAME_PROPERTIES,
  hasKeyframeAt,
  keyframeTimesMs,
  keyframeValueAt,
  type KeyframeProperty,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  SPACING,
  StateIconButton
} from "../../ui_primitives";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle
} from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";

const PROPERTY_LABELS: Record<KeyframeProperty, { label: string; unit?: string; step: number }> = {
  opacity: { label: "Opacity", step: 0.05 },
  scale: { label: "Scale", unit: "×", step: 0.05 },
  offsetX: { label: "Position X", unit: "px", step: 1 },
  offsetY: { label: "Position Y", unit: "px", step: 1 },
  rotation: { label: "Rotation", unit: "°", step: 1 }
};

interface ClipKeyframesProps {
  clip: TimelineClip;
}

const KeyframeRow: React.FC<{
  clip: TimelineClip;
  property: KeyframeProperty;
  atMs: number;
}> = memo(({ clip, property, atMs }) => {
  const setClipKeyframe = useTimelineStore((s) => s.setClipKeyframe);
  const removeClipKeyframe = useTimelineStore((s) => s.removeClipKeyframe);
  const keyframeProperty = useTimelineUIStore((s) => s.keyframeProperty);
  const setKeyframeProperty = useTimelineUIStore((s) => s.setKeyframeProperty);
  const meta = PROPERTY_LABELS[property];
  const value = keyframeValueAt(clip, property, atMs);
  const keyed = hasKeyframeAt(clip, property, atMs);
  const armed = keyframeProperty === property;

  const toggle = useCallback(() => {
    if (keyed) removeClipKeyframe(clip.id, property, atMs);
    else setClipKeyframe(clip.id, property, atMs, value);
    setKeyframeProperty(property);
  }, [keyed, removeClipKeyframe, setClipKeyframe, setKeyframeProperty, clip.id, property, atMs, value]);

  const commit = useCallback(
    (raw: string) => {
      const next = Number.parseFloat(raw);
      if (!Number.isFinite(next)) return;
      setClipKeyframe(clip.id, property, atMs, next);
      setKeyframeProperty(property);
    },
    [setClipKeyframe, setKeyframeProperty, clip.id, property, atMs]
  );

  return (
    <InspectorRow
      label={
        <FlexRow align="center" gap={SPACING.xs}>
          <StateIconButton
            size="small"
            onClick={toggle}
            isActive={keyed}
            icon={<DiamondOutlinedIcon fontSize="inherit" />}
            activeIcon={<DiamondIcon fontSize="inherit" />}
            tooltip={
              keyed
                ? "Remove keyframe at playhead"
                : `Add keyframe at playhead${armed ? " (Alt+K)" : ""}`
            }
            aria-label={`${keyed ? "Remove" : "Add"} ${meta.label} keyframe`}
          />
          <span>{meta.label}</span>
        </FlexRow>
      }
    >
      <InspectorPillInput
        value={String(Math.round(value * 100) / 100)}
        onCommit={commit}
        unit={meta.unit}
        ariaLabel={`${meta.label} at playhead`}
        scrub={{ step: meta.step }}
      />
    </InspectorRow>
  );
});
KeyframeRow.displayName = "KeyframeRow";

export const ClipKeyframes: React.FC<ClipKeyframesProps> = memo(({ clip }) => {
  const [open, setOpen] = usePersistedFold("keyframes");
  const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const atMs = Math.max(
    0,
    Math.min(clip.durationMs, currentTimeMs - clip.startMs)
  );
  const inside = currentTimeMs >= clip.startMs && currentTimeMs <= clip.startMs + clip.durationMs;
  const count = keyframeTimesMs(clip).length;

  return (
    <>
      <InspectorDivider />
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title={count > 0 ? `Keyframes (${count})` : "Keyframes"}
            icon={<TimelineOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.sm} sx={{ py: SPACING.xs }}>
          {!inside && (
            <Caption sx={{ opacity: 0.7 }}>
              Move the playhead over the clip to set keyframes.
            </Caption>
          )}
          {KEYFRAME_PROPERTIES.map((property) => (
            <KeyframeRow key={property} clip={clip} property={property} atMs={atMs} />
          ))}
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
});
ClipKeyframes.displayName = "ClipKeyframes";
