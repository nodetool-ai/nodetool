import React, { memo, useCallback, useState } from "react";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";

import {
  clipSourceMsAt,
  isMediaTrackStale,
  isReframeStale,
  mediaTrackCanDriveReframe,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelineInstance";
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
  InspectorRow,
  InspectorSelect,
  InspectorSliderRow,
  InspectorSectionTitle
} from "./InspectorPrimitives";

const SUBJECT_AUTO = "auto";
const SUBJECT_CENTER = "center";

interface ClipReframeProps {
  clip: TimelineClip;
}

const ClipReframeInternal: React.FC<ClipReframeProps> = ({ clip }) => {
  const [open, setOpen] = usePersistedFold("smartReframe");
  const currentTimeMs = useTimelinePlaybackStore(
    (state) => state.currentTimeMs
  );
  const storedClip = useTimelineStore((state) =>
    state.clips.find((candidate) => candidate.id === clip.id)
  );
  const clipMediaTracks = useTimelineStore((state) =>
    state.mediaTracks.filter((track) => track.clipId === clip.id)
  );
  const setSubject = useTimelineStore((state) => state.setClipReframeSubject);
  const addKeyframe = useTimelineStore((state) => state.addClipReframeKeyframe);
  const clearReframe = useTimelineStore((state) => state.clearClipReframe);
  const activeClip = storedClip ?? clip;
  const reframe = activeClip.reframe;
  const reframeTrack = reframe?.trackId
    ? clipMediaTracks.find((track) => track.id === reframe.trackId)
    : undefined;
  const stale = isReframeStale(activeClip, reframeTrack);
  const mediaTracks = clipMediaTracks.filter(
    (track) =>
      mediaTrackCanDriveReframe(track) &&
      !isMediaTrackStale(track, activeClip)
  );
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [zoom, setZoom] = useState(1);

  const subjectValue =
    reframe?.mode === "track" && reframe.trackId
      ? reframe.trackId
      : reframe?.mode === "center"
        ? SUBJECT_CENTER
        : SUBJECT_AUTO;
  const subjectOptions = [
    { value: SUBJECT_AUTO, label: "Auto" },
    { value: SUBJECT_CENTER, label: "Center" },
    ...mediaTracks.map((track) => ({ value: track.id, label: track.name }))
  ];

  const handleSubject = useCallback(
    (value: string) => {
      if (value === SUBJECT_AUTO || value === SUBJECT_CENTER) {
        setSubject(clip.id, value);
        return;
      }
      setSubject(clip.id, "track", value);
    },
    [clip.id, setSubject]
  );

  const handleAddKeyframe = useCallback(() => {
    addKeyframe(
      clip.id,
      clipSourceMsAt(activeClip, currentTimeMs),
      focusX,
      focusY,
      zoom
    );
  }, [activeClip, addKeyframe, clip.id, currentTimeMs, focusX, focusY, zoom]);

  const handleClear = useCallback(
    () => clearReframe(clip.id),
    [clearReframe, clip.id]
  );

  return (
    <>
      <InspectorDivider />
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title="Smart Reframe"
            icon={<CenterFocusStrongOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
          <InspectorRow label="Subject">
            <InspectorSelect
              label="Reframe subject"
              value={subjectValue}
              options={subjectOptions}
              onChange={handleSubject}
              grow
            />
          </InspectorRow>
          <Caption color="muted">
            Manual framing is recorded in source time, so it stays attached when
            the clip moves or is trimmed.
          </Caption>
          {reframe && (
            <Caption color="muted">
              {reframe.samples?.length ?? 0} automatic samples ·{" "}
              {reframe.keyframes?.length ?? 0} manual corrections
            </Caption>
          )}
          {stale && (
            <Caption color="warning">
              Automatic framing is stale for the current source. The preview
              uses centered framing until you select or generate a matching
              subject track. Manual corrections remain active.
            </Caption>
          )}
          <InspectorSliderRow
            label="Focus X"
            value={focusX}
            display={`${Math.round(focusX * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            onChange={setFocusX}
          />
          <InspectorSliderRow
            label="Focus Y"
            value={focusY}
            display={`${Math.round(focusY * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            onChange={setFocusY}
          />
          <InspectorSliderRow
            label="Zoom"
            value={zoom}
            display={`${zoom.toFixed(2)}×`}
            min={1}
            max={4}
            step={0.01}
            onChange={setZoom}
          />
          <EditorButton
            fullWidth
            variant="contained"
            onClick={handleAddKeyframe}
          >
            Add framing keyframe
          </EditorButton>
          {reframe && (
            <EditorButton
              fullWidth
              variant="outlined"
              color="error"
              onClick={handleClear}
            >
              Clear reframe
            </EditorButton>
          )}
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
};

export const ClipReframe = memo(ClipReframeInternal);
ClipReframe.displayName = "ClipReframe";
