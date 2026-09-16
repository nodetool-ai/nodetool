import React, { memo, useCallback, useState } from "react";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import {
  clipSourceMsAt,
  isMediaTrackStale,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useProvidersByCapability } from "../../../hooks/useProviders";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  SPACING
} from "../../ui_primitives";
import { useTrackingSelection } from "../preview/useTrackingSelection";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow
} from "./InspectorPrimitives";

const BIND_MODE_OPTIONS = [
  { value: "position", label: "Position" },
  { value: "position_scale", label: "Position + scale" }
] as const;

type LiveBindMode = (typeof BIND_MODE_OPTIONS)[number]["value"];

interface ClipTrackingProps {
  clip: TimelineClip;
}

const TrackingSection: React.FC<ClipTrackingProps> = ({ clip }) => {
  const [open, setOpen] = usePersistedFold("tracking");
  const { selection, select } = useTrackingSelection();
  const tracks = useTimelineStore((state) => state.mediaTracks);
  const pause = useTimelinePlaybackStore((state) => state.pause);
  const seek = useTimelinePlaybackStore((state) => state.seek);
  const clearAudition = useTimelineUIStore((state) => state.clearAudition);
  const { providers, isLoading } = useProvidersByCapability("track_object");
  const active =
    selection?.clipId === clip.id &&
    selection.sourceAssetId === clip.currentAssetId
      ? selection
      : null;
  const stale = tracks.some(
    (track) => track.clipId === clip.id && isMediaTrackStale(track, clip)
  );
  const startSelection = (): void => {
    if (!clip.currentAssetId) {
      return;
    }
    pause();
    clearAudition();
    seek(clip.startMs);
    select({
      clipId: clip.id,
      sourceAssetId: clip.currentAssetId,
      sourceMs: clipSourceMsAt(clip, clip.startMs),
      region: null
    });
  };
  return (
    <>
      <InspectorDivider />
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title="Tracking"
            icon={<TrackChangesOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
          <EditorButton
            fullWidth
            onClick={startSelection}
            disabled={!clip.currentAssetId}
          >
            Select subject in preview
          </EditorButton>
          <Caption color="muted">
            Drag a rectangle around the subject. With the preview focused, press
            Enter to create a box, use arrow keys to move it, or Alt and arrow
            keys to resize it. Shift uses larger steps. Delete clears the box.
            Escape stops selection.
          </Caption>
          <Caption color="muted" aria-live="polite">
            {active?.region
              ? `Selected at ${active.sourceMs} source ms: ${Math.round(active.region.x * 100)}%, ${Math.round(active.region.y * 100)}%, ${Math.round(active.region.width * 100)}% wide, ${Math.round(active.region.height * 100)}% high.`
              : "No subject selected."}
          </Caption>
          {active && (
            <EditorButton onClick={() => select(null)}>
              Stop selecting
            </EditorButton>
          )}
          {stale && (
            <Caption color="warning">
              The source changed. Previous tracking samples are unavailable for
              this take. Select the subject again.
            </Caption>
          )}
          <EditorButton
            fullWidth
            variant="contained"
            color="primary"
            disabled
            data-testid="track-object"
          >
            Track subject
          </EditorButton>
          <Caption color="muted">
            {isLoading
              ? "Checking tracking providers."
              : providers.length === 0
                ? "No subject-tracking provider is available."
                : "Tracking is available through the timeline agent. Preview submission is not connected yet."}
          </Caption>
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
};

/**
 * "Follow object": sets/clears a clip's `trackBinding` so it follows a
 * `MediaTrack`'s samples (`TimelineStore.bindToTrack`/`unbindTrack`).
 */
const FollowObjectSection: React.FC<{ clip: TimelineClip }> = memo(
  ({ clip }) => {
    const [open, setOpen] = usePersistedFold("followObject");
    const bindToTrack = useTimelineStore((s) => s.bindToTrack);
    const unbindTrack = useTimelineStore((s) => s.unbindTrack);

    const storedClip = useTimelineStore((s) =>
      s.clips.find((candidate) => candidate.id === clip.id)
    );
    const binding = storedClip ? storedClip.trackBinding : clip.trackBinding;
    const [trackIdInput, setTrackIdInput] = useState(binding?.trackId ?? "");
    const [mode, setMode] = useState<LiveBindMode>(
      binding?.mode === "position_scale" ? "position_scale" : "position"
    );

    const handleModeChange = useCallback(
      (value: string) => {
        if (value !== "position" && value !== "position_scale") return;
        setMode(value);
        const trackId = trackIdInput.trim();
        if (!binding || !trackId) return;
        bindToTrack(clip.id, trackId, value, {
          offset: binding.offset,
          scale: binding.scale,
          rotationOffset: binding.rotationOffset,
          smoothing: binding.smoothing
        });
      },
      [binding, bindToTrack, clip.id, trackIdInput]
    );

    const handleTrackIdCommit = useCallback(
      (value: string) => {
        setTrackIdInput(value);
        const trackId = value.trim();
        if (!binding || !trackId) return;
        bindToTrack(clip.id, trackId, mode, {
          offset: binding.offset,
          scale: binding.scale,
          rotationOffset: binding.rotationOffset,
          smoothing: binding.smoothing
        });
      },
      [binding, bindToTrack, clip.id, mode]
    );

    const handleBind = useCallback(() => {
      const trackId = trackIdInput.trim();
      if (!trackId) return;
      bindToTrack(clip.id, trackId, mode, {
        offset: binding?.offset,
        scale: binding?.scale,
        rotationOffset: binding?.rotationOffset,
        smoothing: binding?.smoothing
      });
    }, [bindToTrack, clip.id, trackIdInput, mode, binding]);

    const handleUnbind = useCallback(
      () => unbindTrack(clip.id),
      [unbindTrack, clip.id]
    );

    const handleOffsetX = useCallback(
      (raw: string) => {
        if (!binding) return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        bindToTrack(clip.id, trackIdInput.trim() || binding.trackId, mode, {
          ...binding,
          offset: { x: value, y: binding.offset?.y ?? 0 }
        });
      },
      [binding, bindToTrack, clip.id, mode, trackIdInput]
    );
    const handleOffsetY = useCallback(
      (raw: string) => {
        if (!binding) return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        bindToTrack(clip.id, trackIdInput.trim() || binding.trackId, mode, {
          ...binding,
          offset: { x: binding.offset?.x ?? 0, y: value }
        });
      },
      [binding, bindToTrack, clip.id, mode, trackIdInput]
    );
    const handleScale = useCallback(
      (value: number) => {
        if (!binding) return;
        bindToTrack(clip.id, trackIdInput.trim() || binding.trackId, mode, {
          ...binding,
          scale: value
        });
      },
      [binding, bindToTrack, clip.id, mode, trackIdInput]
    );
    const handleSmoothing = useCallback(
      (value: number) => {
        if (!binding) return;
        bindToTrack(clip.id, trackIdInput.trim() || binding.trackId, mode, {
          ...binding,
          smoothing: value
        });
      },
      [binding, bindToTrack, clip.id, mode, trackIdInput]
    );

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Follow object"
              icon={<LinkOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <Caption color="muted">
              Track id — from list_tracks, or the track_object result once a
              provider is wired up.
            </Caption>
            <InspectorRow label="Track id">
              <InspectorPillInput
                value={trackIdInput}
                onCommit={handleTrackIdCommit}
                ariaLabel="Track id to follow"
              />
            </InspectorRow>
            <InspectorRow label="Mode">
              <InspectorSelect
                label="Follow mode"
                value={mode}
                options={BIND_MODE_OPTIONS}
                onChange={handleModeChange}
                grow
              />
            </InspectorRow>

            {!binding && (
              <EditorButton
                fullWidth
                variant="contained"
                color="primary"
                startIcon={<LinkOutlinedIcon />}
                disabled={trackIdInput.trim() === ""}
                onClick={handleBind}
                data-testid="bind-to-track"
              >
                Follow
              </EditorButton>
            )}

            {binding && (
              <>
                <InspectorRow label="Offset X">
                  <InspectorPillInput
                    value={String(binding.offset?.x ?? 0)}
                    unit="px"
                    onCommit={handleOffsetX}
                    ariaLabel="Follow offset X"
                  />
                </InspectorRow>
                <InspectorRow label="Offset Y">
                  <InspectorPillInput
                    value={String(binding.offset?.y ?? 0)}
                    unit="px"
                    onCommit={handleOffsetY}
                    ariaLabel="Follow offset Y"
                  />
                </InspectorRow>
                {mode === "position_scale" && (
                  <InspectorSliderRow
                    label="Scale"
                    value={binding.scale ?? 1}
                    display={(binding.scale ?? 1).toFixed(2)}
                    min={0}
                    max={4}
                    step={0.01}
                    onChange={handleScale}
                  />
                )}
                <InspectorSliderRow
                  label="Smoothing"
                  value={binding.smoothing ?? 0}
                  display={(binding.smoothing ?? 0).toFixed(2)}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={handleSmoothing}
                />
                <EditorButton
                  fullWidth
                  variant="outlined"
                  color="error"
                  startIcon={<LinkOffOutlinedIcon />}
                  onClick={handleUnbind}
                  data-testid="unbind-track"
                >
                  Unfollow
                </EditorButton>
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);
FollowObjectSection.displayName = "FollowObjectSection";

/**
 * Tracking + follow controls for one clip, picking the section that fits its
 * `mediaType` — a video clip can be tracked FROM, a text/shape/image clip can
 * follow a track.
 */
export const ClipTracking: React.FC<{ clip: TimelineClip }> = memo(
  ({ clip }) => {
    if (clip.mediaType === "video") {
      return <TrackingSection clip={clip} />;
    }
    if (
      clip.mediaType === "text" ||
      clip.mediaType === "shape" ||
      clip.mediaType === "image"
    ) {
      return <FollowObjectSection clip={clip} />;
    }
    return null;
  }
);
ClipTracking.displayName = "ClipTracking";
