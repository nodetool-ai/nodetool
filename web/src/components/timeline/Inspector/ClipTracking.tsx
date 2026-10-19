import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import {
  clipSourceMsAt,
  isMediaTrackStale,
  type TimelineClip,
  type TrackBinding
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTrackObject } from "../../../hooks/timeline/useTrackObject";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn
} from "../../ui_primitives";
import { useTrackingSelection } from "../preview/useTrackingSelection";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  INSPECTOR_SECTION_CONTENT_SX
} from "./InspectorPrimitives";

type LiveBindMode = "position" | "position_scale";

/** `bindToTrack` writes only the live modes; other modes edit as position. */
const liveModeOf = (binding: TrackBinding): LiveBindMode =>
  binding.mode === "position_scale" ? "position_scale" : "position";

interface ClipTrackingProps {
  clip: TimelineClip;
}

const TrackingSection: React.FC<ClipTrackingProps> = ({ clip }) => {
  const { t } = useTranslation();
  const [open, setOpen] = usePersistedFold("tracking");
  const { selection, select } = useTrackingSelection();
  const tracks = useTimelineStore((state) => state.mediaTracks);
  const pause = useTimelinePlaybackStore((state) => state.pause);
  const seek = useTimelinePlaybackStore((state) => state.seek);
  const clearAudition = useTimelineUIStore((state) => state.clearAudition);
  const active =
    selection?.clipId === clip.id &&
    selection.sourceAssetId === clip.currentAssetId
      ? selection
      : null;
  const {
    model,
    modelError,
    isLoadingModel,
    status,
    error,
    canTrack,
    start
  } = useTrackObject(clip, active);
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
            title={t("pass3_27.clipTracking.title")}
            icon={<TrackChangesOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
          <EditorButton
            fullWidth
            onClick={startSelection}
            disabled={!clip.currentAssetId}
          >
            {t("pass3_27.clipTracking.selectSubject")}
          </EditorButton>
          <Caption color="muted">
            {t("pass3_27.clipTracking.selectionHelp")}
          </Caption>
          <Caption color="muted" aria-live="polite">
            {active?.region
              ? t("pass3_27.clipTracking.selectionSummary", { sourceMs: active.sourceMs, x: Math.round(active.region.x * 100), y: Math.round(active.region.y * 100), width: Math.round(active.region.width * 100), height: Math.round(active.region.height * 100) })
              : t("pass3_27.clipTracking.noSubjectSelected")}
          </Caption>
          {active && (
            <EditorButton onClick={() => select(null)}>
              {t("pass3_27.clipTracking.stopSelecting")}
            </EditorButton>
          )}
          {stale && (
            <Caption color="warning">
              {t("pass3_27.clipTracking.staleSource")}
            </Caption>
          )}
          <EditorButton
            fullWidth
            variant="contained"
            color="primary"
            disabled={!canTrack}
            onClick={() => void start()}
            data-testid="track-object"
          >
            {status === "pending" ? t("pass3_27.clipTracking.tracking") : t("pass3_27.clipTracking.trackSubject")}
          </EditorButton>
          {error && (
            <ErrorBanner
              report={{
                source: "operation-failure",
                summary: t("pass3_27.clipTracking.failed"),
                errorText: error
              }}
            >
              {error}
            </ErrorBanner>
          )}
          <Caption color="muted" aria-live="polite">
            {isLoadingModel
              ? t("pass3_27.clipTracking.checkingModels")
              : modelError
                ? t("pass3_27.clipTracking.modelsLoadError")
                : !model
                  ? t("pass3_27.clipTracking.noModel")
                  : status === "pending"
                    ? t("pass3_27.clipTracking.running")
                    : active?.region
                      ? t("pass3_27.clipTracking.ready", { model: model.name })
                      : t("pass3_27.clipTracking.selectToBegin", { model: model.name })}
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
    const { t } = useTranslation();
    const [open, setOpen] = usePersistedFold("followObject");
    const bindToTrack = useTimelineStore((s) => s.bindToTrack);
    const unbindTrack = useTimelineStore((s) => s.unbindTrack);

    const storedClip = useTimelineStore((s) =>
      s.clips.find((candidate) => candidate.id === clip.id)
    );
    const binding = storedClip ? storedClip.trackBinding : clip.trackBinding;
    const [draftTrackId, setDraftTrackId] = useState("");
    const [draftMode, setDraftMode] = useState<LiveBindMode>("position");
    const trackIdInput = binding ? binding.trackId : draftTrackId;
    const mode = binding ? liveModeOf(binding) : draftMode;

    const handleModeChange = useCallback(
      (value: string) => {
        if (value !== "position" && value !== "position_scale") return;
        if (!binding) {
          setDraftMode(value);
          return;
        }
        bindToTrack(clip.id, binding.trackId, value, {
          offset: binding.offset,
          scale: binding.scale,
          rotationOffset: binding.rotationOffset,
          smoothing: binding.smoothing
        });
      },
      [binding, bindToTrack, clip.id]
    );

    const handleTrackIdCommit = useCallback(
      (value: string) => {
        if (!binding) {
          setDraftTrackId(value);
          return;
        }
        const trackId = value.trim();
        if (!trackId) return;
        bindToTrack(clip.id, trackId, liveModeOf(binding), {
          offset: binding.offset,
          scale: binding.scale,
          rotationOffset: binding.rotationOffset,
          smoothing: binding.smoothing
        });
      },
      [binding, bindToTrack, clip.id]
    );

    const handleBind = useCallback(() => {
      const trackId = draftTrackId.trim();
      if (!trackId) return;
      bindToTrack(clip.id, trackId, draftMode);
    }, [bindToTrack, clip.id, draftTrackId, draftMode]);

    const handleUnbind = useCallback(
      () => unbindTrack(clip.id),
      [unbindTrack, clip.id]
    );

    const handleOffsetX = useCallback(
      (raw: string) => {
        if (!binding) return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        bindToTrack(clip.id, binding.trackId, liveModeOf(binding), {
          ...binding,
          offset: { x: value, y: binding.offset?.y ?? 0 }
        });
      },
      [binding, bindToTrack, clip.id]
    );
    const handleOffsetY = useCallback(
      (raw: string) => {
        if (!binding) return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        bindToTrack(clip.id, binding.trackId, liveModeOf(binding), {
          ...binding,
          offset: { x: binding.offset?.x ?? 0, y: value }
        });
      },
      [binding, bindToTrack, clip.id]
    );
    const handleScale = useCallback(
      (value: number) => {
        if (!binding) return;
        bindToTrack(clip.id, binding.trackId, liveModeOf(binding), {
          ...binding,
          scale: value
        });
      },
      [binding, bindToTrack, clip.id]
    );
    const handleSmoothing = useCallback(
      (value: number) => {
        if (!binding) return;
        bindToTrack(clip.id, binding.trackId, liveModeOf(binding), {
          ...binding,
          smoothing: value
        });
      },
      [binding, bindToTrack, clip.id]
    );

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
            title={t("pass3_27.clipTracking.followObject")}
              icon={<LinkOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
            <Caption color="muted">
              {t("pass3_27.clipTracking.trackIdHelp")}
            </Caption>
            <InspectorRow label={t("pass3_27.clipTracking.trackId")}>
              <InspectorPillInput
                value={trackIdInput}
                onCommit={handleTrackIdCommit}
                ariaLabel={t("pass3_27.clipTracking.trackIdAria")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_27.clipTracking.mode")}>
              <InspectorSelect
                label={t("pass3_27.clipTracking.followMode")}
                value={mode}
                options={[{ value: "position", label: t("pass3_27.clipTracking.position") }, { value: "position_scale", label: t("pass3_27.clipTracking.positionScale") }]}
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
                {t("pass3_27.clipTracking.follow")}
              </EditorButton>
            )}

            {binding && (
              <>
                <InspectorRow label={t("pass3_27.clipTracking.offsetX")}>
                  <InspectorPillInput
                    value={String(binding.offset?.x ?? 0)}
                    unit="px"
                    onCommit={handleOffsetX}
                    ariaLabel={t("pass3_27.clipTracking.offsetXAria")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_27.clipTracking.offsetY")}>
                  <InspectorPillInput
                    value={String(binding.offset?.y ?? 0)}
                    unit="px"
                    onCommit={handleOffsetY}
                    ariaLabel={t("pass3_27.clipTracking.offsetYAria")}
                  />
                </InspectorRow>
                {mode === "position_scale" && (
                  <InspectorSliderRow
                    label={t("pass3_27.clipTracking.scale")}
                    value={binding.scale ?? 1}
                    display={(binding.scale ?? 1).toFixed(2)}
                    min={0}
                    max={4}
                    step={0.01}
                    onChange={handleScale}
                    origin={1}
                  />
                )}
                <InspectorSliderRow
                  label={t("pass3_27.clipTracking.smoothing")}
                  value={binding.smoothing ?? 0}
                  display={(binding.smoothing ?? 0).toFixed(2)}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={handleSmoothing}
                  origin={0}
                />
                <EditorButton
                  fullWidth
                  variant="outlined"
                  color="error"
                  startIcon={<LinkOffOutlinedIcon />}
                  onClick={handleUnbind}
                  data-testid="unbind-track"
                >
                  {t("pass3_27.clipTracking.unfollow")}
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
      return <FollowObjectSection key={clip.id} clip={clip} />;
    }
    return null;
  }
);
ClipTracking.displayName = "ClipTracking";
