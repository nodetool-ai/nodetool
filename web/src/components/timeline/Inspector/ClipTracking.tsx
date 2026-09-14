/**
 * Subject/object tracking (P0 AI Video, Phase 2).
 *
 * Two sections, shown depending on the clip's own `mediaType`:
 *
 * - `TrackingSection` (video clips): starts a `track_object` run on this
 *   clip's own source. There is no interactive rectangle-select tool in this
 *   pass — building a canvas drag-to-select UI is a separate, larger
 *   interactive-canvas feature — so the initial region is four numeric 0..1
 *   fraction inputs instead of a drawn box. There is also no tracking
 *   provider wired up in this build (`track_object`'s own doc comment), so
 *   the button is disabled with a caption saying so rather than pretending a
 *   call would do anything.
 * - `FollowObjectSection` (text/shape/image clips): sets/clears the clip's
 *   `trackBinding`. This is fully wired — `TimelineStore.bindToTrack`/
 *   `unbindTrack` are plain `set()` calls the same way every other
 *   clip-field action here is, so undo/redo comes for free. The track
 *   picker is a manually-typed id rather than a populated dropdown: the
 *   store does not carry the document's `mediaTracks` list in this pass (no
 *   provider ever produces one to show), so there is nothing to list yet.
 *   Only `"position"`/`"position_scale"` are offered — the only modes the
 *   scene model resolves (`TrackBinding.mode`'s doc comment).
 */

import React, { memo, useCallback, useState } from "react";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import type { TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  SPACING
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

const SCRUB_UNIT = { step: 0.01, min: 0, max: 1 };
const SCRUB_MS = { step: 100, min: 0 };

const BIND_MODE_OPTIONS = [
  { value: "position", label: "Position" },
  { value: "position_scale", label: "Position + scale" }
] as const;

type LiveBindMode = (typeof BIND_MODE_OPTIONS)[number]["value"];

function commitUnit(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  apply(Math.min(1, Math.max(0, value)));
}

function commitMs(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return;
  apply(value);
}

/**
 * Numeric-input `track_object` starter on a video clip. No canvas
 * rectangle-select, no working provider call — see this file's doc comment.
 */
const TrackingSection: React.FC<{ clip: TimelineClip }> = memo(({ clip }) => {
  const [open, setOpen] = usePersistedFold("tracking");
  const [x, setX] = useState(0.1);
  const [y, setY] = useState(0.1);
  const [width, setWidth] = useState(0.2);
  const [height, setHeight] = useState(0.2);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(Math.max(1000, clip.durationMs));

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
          <Caption color="muted">
            Starting region, as a fraction of the source frame (0..1). There is
            no rectangle-select tool yet — type the box the subject starts in.
          </Caption>
          <InspectorRow label="X">
            <InspectorPillInput
              value={String(x)}
              scrub={SCRUB_UNIT}
              onCommit={(raw) => commitUnit(raw, setX)}
              ariaLabel="Initial region X"
            />
          </InspectorRow>
          <InspectorRow label="Y">
            <InspectorPillInput
              value={String(y)}
              scrub={SCRUB_UNIT}
              onCommit={(raw) => commitUnit(raw, setY)}
              ariaLabel="Initial region Y"
            />
          </InspectorRow>
          <InspectorRow label="Width">
            <InspectorPillInput
              value={String(width)}
              scrub={SCRUB_UNIT}
              onCommit={(raw) => commitUnit(raw, setWidth)}
              ariaLabel="Initial region width"
            />
          </InspectorRow>
          <InspectorRow label="Height">
            <InspectorPillInput
              value={String(height)}
              scrub={SCRUB_UNIT}
              onCommit={(raw) => commitUnit(raw, setHeight)}
              ariaLabel="Initial region height"
            />
          </InspectorRow>
          <InspectorRow label="Start">
            <InspectorPillInput
              value={String(startMs)}
              unit="ms"
              scrub={SCRUB_MS}
              onCommit={(raw) => commitMs(raw, setStartMs)}
              ariaLabel="Tracking window start, source ms"
            />
          </InspectorRow>
          <InspectorRow label="End">
            <InspectorPillInput
              value={String(endMs)}
              unit="ms"
              scrub={SCRUB_MS}
              onCommit={(raw) => commitMs(raw, setEndMs)}
              ariaLabel="Tracking window end, source ms"
            />
          </InspectorRow>

          <EditorButton
            fullWidth
            variant="contained"
            color="primary"
            startIcon={<TrackChangesOutlinedIcon />}
            disabled
            data-testid="track-object"
          >
            Track subject
          </EditorButton>
          <Caption color="muted">
            No tracking provider is configured in this build yet — this starts
            nothing. The track_object capability exists as a documented seam
            in packages/agents/src/capabilities/timeline-track-object.ts for a
            provider to be wired into.
          </Caption>
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
});
TrackingSection.displayName = "TrackingSection";

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
