import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";
import { useShallow } from "zustand/react/shallow";

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
  const { t } = useTranslation();
  const [open, setOpen] = usePersistedFold("smartReframe");
  const currentTimeMs = useTimelinePlaybackStore(
    (state) => state.currentTimeMs
  );
  const storedClip = useTimelineStore((state) =>
    state.clips.find((candidate) => candidate.id === clip.id)
  );
  const clipMediaTracks = useTimelineStore(
    useShallow((state) =>
      state.mediaTracks.filter((track) => track.clipId === clip.id)
    )
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
      mediaTrackCanDriveReframe(track) && !isMediaTrackStale(track, activeClip)
  );
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const playheadInClip =
    currentTimeMs >= activeClip.startMs &&
    currentTimeMs <= activeClip.startMs + activeClip.durationMs;

  const subjectValue =
    reframe?.mode === "track" && reframe.trackId
      ? reframe.trackId
      : reframe?.mode === "center"
        ? SUBJECT_CENTER
        : SUBJECT_AUTO;
  const subjectOptions = [
    {
      value: SUBJECT_AUTO,
      label: t("pass3_25.timeline.inspector.reframe.auto")
    },
    {
      value: SUBJECT_CENTER,
      label: t("pass3_25.timeline.inspector.reframe.center")
    },
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
    if (!playheadInClip) return;
    addKeyframe(
      clip.id,
      clipSourceMsAt(activeClip, currentTimeMs),
      focusX,
      focusY,
      zoom
    );
  }, [
    activeClip,
    addKeyframe,
    clip.id,
    currentTimeMs,
    focusX,
    focusY,
    playheadInClip,
    zoom
  ]);

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
            title={t("pass3_25.timeline.inspector.reframe.title")}
            icon={<CenterFocusStrongOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
          <InspectorRow
            label={t("pass3_25.timeline.inspector.reframe.subject")}
          >
            <InspectorSelect
              label={t("pass3_25.timeline.inspector.reframe.reframeSubject")}
              value={subjectValue}
              options={subjectOptions}
              onChange={handleSubject}
              grow
            />
          </InspectorRow>
          <Caption color="muted">
            {t("pass3_25.timeline.inspector.reframe.manualFramingHelp")}
          </Caption>
          {reframe && (
            <Caption color="muted">
              {t("pass3_25.timeline.inspector.reframe.sampleSummary", {
                samples: reframe.samples?.length ?? 0,
                corrections: reframe.keyframes?.length ?? 0
              })}
            </Caption>
          )}
          {stale && (
            <Caption color="warning">
              {t("pass3_25.timeline.inspector.reframe.staleHelp")}
            </Caption>
          )}
          <InspectorSliderRow
            label={t("pass3_25.timeline.inspector.reframe.focusX")}
            value={focusX}
            display={`${Math.round(focusX * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            onChange={setFocusX}
            origin={0.5}
          />
          <InspectorSliderRow
            label={t("pass3_25.timeline.inspector.reframe.focusY")}
            value={focusY}
            display={`${Math.round(focusY * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            onChange={setFocusY}
            origin={0.5}
          />
          <InspectorSliderRow
            label={t("pass3_25.timeline.inspector.reframe.zoom")}
            value={zoom}
            display={`${zoom.toFixed(2)}×`}
            min={1}
            max={4}
            step={0.01}
            onChange={setZoom}
            origin={1}
          />
          <EditorButton
            fullWidth
            variant="contained"
            onClick={handleAddKeyframe}
            disabled={!playheadInClip}
          >
            {t("pass3_25.timeline.inspector.reframe.addKeyframe")}
          </EditorButton>
          {!playheadInClip && (
            <Caption color="muted">
              {t("pass3_25.timeline.inspector.reframe.movePlayheadHelp")}
            </Caption>
          )}
          {reframe && (
            <EditorButton
              fullWidth
              variant="outlined"
              color="error"
              onClick={handleClear}
            >
              {t("pass3_25.timeline.inspector.reframe.clear")}
            </EditorButton>
          )}
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
};

// Keyed by clip so the focus and zoom draft start fresh on each clip.
export const ClipReframe = memo(({ clip }: ClipReframeProps) => (
  <ClipReframeInternal key={clip.id} clip={clip} />
));
ClipReframe.displayName = "ClipReframe";
