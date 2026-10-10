/**
 * ShotEditViewer
 *
 * The Edit Shot dialog's left column: the shot's selected still (or its clip,
 * when it has one) big enough to judge, with pan and zoom, a version pager,
 * and the two edits that produce a new take — mirror, and hand-off to the
 * image editor.
 *
 * Neither edit touches the version it started from. Both render or copy the
 * still into a fresh asset and append it as a candidate, so the
 * previous take is still in the takes gallery afterwards (criterion 15). The
 * paint tools are the image editor's, not a second raster editor of our own
 * (PRD D15).
 */

import React, { memo, useCallback, useRef, useState } from "react";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import { resolveEffectiveProductionRequirement } from "@nodetool-ai/protocol";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FlipIcon from "@mui/icons-material/Flip";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  ResponsiveImage,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  VideoPlayer,
  ZoomControls,
  BORDER_RADIUS,
  SPACING,
  SPACING_PX,
  TYPOGRAPHY
} from "../ui_primitives";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import { getErrorMessage } from "../../utils/errorHandling";
import ShotDesignFrame from "./ShotDesignFrame";
import { isShotGenerating } from "./ShotStatusPill";
import { copiedStill, flippedStill } from "./shotImageEdits";
import { syncShotClipToTimeline } from "../../stores/storyboard/timelineSync";

interface ShotEditViewerProps {
  boardId: string;
  shot: Shot;
  /** Hides every edit on a board that cannot be changed. */
  readOnly?: boolean;
  /** Closes the dialog when an action moves the creator to another tab. */
  onLeave?: () => void;
  /** Resolves whether a dirty panel may hand off to the image editor. */
  onBeforeImageEditor?: () => Promise<boolean>;
}

type Medium = "still" | "clip";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const PAN_STEP = SPACING_PX.xxl;

/** The stage: the frame the media is panned and zoomed inside. */
const stageSx = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  borderRadius: BORDER_RADIUS.lg,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "c_overlay_subtle",
  display: "grid",
  placeItems: "center",
  cursor: "grab",
  "&[data-panning='true']": { cursor: "grabbing" }
} as const;

/** How far a finger has to travel sideways for a swipe to change the take. */
const SWIPE_MIN_PX = 40;

const pagerSx = {
  ...TYPOGRAPHY.mono.caption,
  color: "text.secondary",
  minWidth: "4rem",
  textAlign: "center"
} as const;

const reportFailure = (error: unknown, what: string): void => {
  useNotificationStore.getState().addNotification({
    type: "error",
    alert: true,
    dismissable: true,
    content: `${what} ${getErrorMessage(error, "Try again.")}`
  });
};

const versionsOf = (shot: Shot, medium: Medium): (ImageRef | VideoRef)[] =>
  medium === "clip"
    ? (shot.clip_versions ?? (shot.clip ? [shot.clip] : []))
    : (shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []));

const stillVersionsOf = (shot: Shot): ImageRef[] =>
  shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []);

const clipVersionsOf = (shot: Shot): VideoRef[] =>
  shot.clip_versions ?? (shot.clip ? [shot.clip] : []);

interface PreviewState {
  shotId: string;
  still: number;
  clip: number;
}

const currentIndex = (
  versions: readonly (ImageRef | VideoRef)[],
  current: ImageRef | VideoRef | null | undefined
): number => {
  if (!current) {
    return 0;
  }
  const index = versions.findIndex((version) => sameMediaRef(version, current));
  return index >= 0 ? index : 0;
};

const initialPreviewState = (shot: Shot): PreviewState => ({
  shotId: shot.id,
  still: currentIndex(versionsOf(shot, "still"), shot.keyframe),
  clip: currentIndex(versionsOf(shot, "clip"), shot.clip)
});

const defaultMedium = (shot: Shot): Medium =>
  shot.clip || (!shot.keyframe && versionsOf(shot, "clip").length > 0)
    ? "clip"
    : "still";

const ShotEditViewerInner: React.FC<ShotEditViewerProps> = ({
  boardId,
  shot,
  readOnly,
  onLeave,
  onBeforeImageEditor
}) => {
  const stillVersions = stillVersionsOf(shot);
  const clipVersions = clipVersionsOf(shot);
  const hasClip =
    clipVersions.length > 0 &&
    resolveEffectiveProductionRequirement(undefined, shot.production)
      ?.media_strategy !== "still_motion_graphics";
  const [mediumState, setMediumState] = useState(() => ({
    shotId: shot.id,
    value: defaultMedium(shot)
  }));
  const medium =
    mediumState.shotId === shot.id ? mediumState.value : defaultMedium(shot);
  const [previewState, setPreviewState] = useState(() =>
    initialPreviewState(shot)
  );
  // A take that lands while the viewer is open (a still edit, a re-render,
  // a flip) is the one the creator is waiting for: show it. It stays a
  // preview; "Set current" makes it the shot's still.
  const [seenStills, setSeenStills] = useState(() => ({
    shotId: shot.id,
    count: stillVersions.length
  }));
  if (seenStills.shotId !== shot.id) {
    setSeenStills({ shotId: shot.id, count: stillVersions.length });
  } else if (stillVersions.length !== seenStills.count) {
    setSeenStills({ shotId: shot.id, count: stillVersions.length });
    if (stillVersions.length > seenStills.count) {
      const newest = stillVersions.length - 1;
      setPreviewState((previous) => ({
        ...(previous.shotId === shot.id ? previous : initialPreviewState(shot)),
        still: newest
      }));
      setMediumState({ shotId: shot.id, value: "still" });
    }
  }
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const panFrom = useRef<{ x: number; y: number } | null>(null);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  const acceptKeyframeVersion = useStoryboardStore(
    (state) => state.acceptKeyframeVersion
  );
  const acceptClipVersion = useStoryboardStore(
    (state) => state.acceptClipVersion
  );
  const appendShotKeyframeVersion = useStoryboardStore(
    (state) => state.appendShotKeyframeVersion
  );
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const shown: Medium = hasClip ? medium : "still";
  const versions = shown === "clip" ? clipVersions : stillVersions;
  const current = shown === "clip" ? shot.clip : shot.keyframe;
  const effectivePreview =
    previewState.shotId === shot.id ? previewState : initialPreviewState(shot);
  const requestedIndex = effectivePreview[shown];
  const index = Math.min(requestedIndex, Math.max(versions.length - 1, 0));
  const previewedStill = shown === "still" ? stillVersions[index] : undefined;
  const previewedClip = shown === "clip" ? clipVersions[index] : undefined;
  const previewed = previewedClip ?? previewedStill;
  const acceptedIndex = currentIndex(versions, current);
  const isCurrent =
    !!previewed && !!current && sameMediaRef(previewed, current);

  // Flip and the editor hand-off both need bytes, and only the still has an
  // editable one; the player resolves its own.
  const stillUrl = useResolvedMediaUri(previewedStill);
  const stillName = `Shot ${shot.index + 1} still`;

  const step = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= versions.length) {
        return;
      }
      setPreviewState((previous) => {
        const currentState =
          previous.shotId === shot.id ? previous : initialPreviewState(shot);
        return { ...currentState, [shown]: next };
      });
    },
    [index, versions.length, shot, shown]
  );

  const handlePrevious = useCallback(() => step(-1), [step]);
  const handleNext = useCallback(() => step(1), [step]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Pan with the primary button only, and never from media controls:
      // capturing the pointer there would turn a click on play or the seek bar
      // into a pan.
      if (
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest(
            "button, input, select, video, a, [role=slider], [role=button]"
          ))
      ) {
        return;
      }
      // A finger on an unzoomed take swipes between takes; the page keeps
      // its vertical scroll (the stage's touch-action is pan-y then).
      if (event.pointerType === "touch" && zoom === 1) {
        swipeFrom.current = { x: event.clientX, y: event.clientY };
        return;
      }
      panFrom.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pan.x, pan.y, zoom]
  );
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const from = panFrom.current;
      if (from) {
        setPan({ x: event.clientX - from.x, y: event.clientY - from.y });
      }
    },
    []
  );
  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      panFrom.current = null;
      const from = swipeFrom.current;
      swipeFrom.current = null;
      if (!from || event.type === "pointercancel") {
        return;
      }
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
        step(dx < 0 ? 1 : -1);
      }
    },
    [step]
  );

  const nudgePan = useCallback((x: number, y: number) => {
    setPan((currentPan) => ({
      x: currentPan.x + x,
      y: currentPan.y + y
    }));
  }, []);

  const handleZoom = useCallback((next: number) => {
    setZoom(next);
    if (next === 1) {
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const handleMedium = useCallback(
    (_event: React.MouseEvent<HTMLElement>, next: Medium | null) => {
      if (next) {
        setMediumState({ shotId: shot.id, value: next });
      }
    },
    [shot.id]
  );

  /** Upload a rendered still as a candidate without changing current media. */
  const addVersion = useCallback(
    (file: File, failure: string) =>
      uploadAsset({
        file,
        onCompleted: (asset) => {
          setBusy(false);
          appendShotKeyframeVersion(
            boardId,
            shot.id,
            mediaRefFromAsset(asset, "image")
          );
        },
        onFailed: (error) => {
          setBusy(false);
          reportFailure(error, failure);
        }
      }),
    [uploadAsset, appendShotKeyframeVersion, boardId, shot.id]
  );

  const handleStageKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.defaultPrevented ||
        event.target !== event.currentTarget ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    },
    [step]
  );

  const handleAccept = useCallback(() => {
    if (!previewed || isCurrent) {
      return;
    }
    if (shown === "clip") {
      acceptClipVersion(boardId, shot.id, index);
      if (previewedClip?.asset_id) {
        void syncShotClipToTimeline(boardId, shot.id, previewedClip.asset_id);
      }
    } else {
      acceptKeyframeVersion(boardId, shot.id, index);
    }
  }, [
    previewed,
    isCurrent,
    shown,
    acceptClipVersion,
    boardId,
    shot.id,
    index,
    previewedClip,
    acceptKeyframeVersion
  ]);

  const handleFlip = useCallback(async () => {
    if (!stillUrl) {
      return;
    }
    setBusy(true);
    try {
      // `busy` clears when the upload settles, not when it is queued.
      addVersion(
        await flippedStill(stillUrl, `${stillName} flipped.png`),
        "The flip could not be saved."
      );
    } catch (error) {
      setBusy(false);
      reportFailure(error, "The still could not be flipped.");
    }
  }, [stillUrl, stillName, addVersion]);

  const handleOpenImageEditor = useCallback(async () => {
    if (!stillUrl) {
      return;
    }
    try {
      if (onBeforeImageEditor && !(await onBeforeImageEditor())) {
        return;
      }
      setBusy(true);
      const file = await copiedStill(stillUrl, `${stillName} edit.png`);
      uploadAsset({
        file,
        onCompleted: (asset) => {
          setBusy(false);
          appendShotKeyframeVersion(
            boardId,
            shot.id,
            mediaRefFromAsset(asset, "image")
          );
          openTab({
            type: "image",
            ref: asset.id,
            mode: "edit",
            title: stillName,
            projectId: asset.project_id
          });
          onLeave?.();
        },
        onFailed: (error) => {
          setBusy(false);
          reportFailure(error, "The still could not be opened for editing.");
        }
      });
    } catch (error) {
      setBusy(false);
      reportFailure(error, "The still could not be opened for editing.");
    }
  }, [
    stillUrl,
    stillName,
    uploadAsset,
    appendShotKeyframeVersion,
    boardId,
    shot.id,
    openTab,
    onLeave,
    onBeforeImageEditor
  ]);

  const canEditStill = !readOnly && !!stillUrl && !busy;
  const jobActive = useStoryboardGenerationStore((state) => {
    const status = state.shotJobs[shot.id]?.status;
    return status === "queued" || status === "running";
  });
  const generating = jobActive || isShotGenerating(shot);

  return (
    <FlexColumn gap={SPACING.md} fullHeight sx={{ minWidth: 0 }}>
      <Box
        // Unzoomed, a vertical swipe scrolls the editor instead of being
        // trapped by the stage.
        sx={{ ...stageSx, touchAction: zoom > 1 ? "none" : "pan-y" }}
        role="region"
        aria-busy={generating || undefined}
        aria-label={`${shown === "clip" ? "Clip" : "Still"} take preview. Focus this region to browse takes with the left and right arrow keys.`}
        tabIndex={0}
        data-panning={panFrom.current ? "true" : undefined}
        onKeyDown={handleStageKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="shot-edit-stage"
      >
        <Box
          data-testid="shot-edit-media-transform"
          sx={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center",
            width:
              shot.graphics && shot.graphics.mode !== "none"
                ? "100%"
                : undefined,
            height:
              shot.graphics && shot.graphics.mode !== "none"
                ? "100%"
                : undefined,
            maxWidth: "100%",
            maxHeight: "100%"
          }}
        >
          {shot.graphics && shot.graphics.mode !== "none" ? (
            <ShotDesignFrame
              boardId={boardId}
              shot={{
                ...shot,
                keyframe: previewedStill ?? shot.keyframe,
                clip: previewedClip ?? shot.clip
              }}
            />
          ) : previewedClip ? (
            <VideoPlayer
              locator={previewedClip}
              label={`Shot ${shot.index + 1}`}
            />
          ) : previewedStill ? (
            <ResponsiveImage
              locator={previewedStill}
              alt={`Shot ${shot.index + 1} still`}
              fit="contain"
            />
          ) : (
            <Caption color="muted">No still yet</Caption>
          )}
        </Box>
        {generating && (
          <MagicGenerationFill
            borderRadius={BORDER_RADIUS.lg}
            data-testid="shot-edit-generating"
          />
        )}
      </Box>

      <FlexRow align="center" gap={SPACING.sm} wrap>
        {hasClip && (
          <ToggleGroup
            exclusive
            size="small"
            segmented
            value={shown}
            onChange={handleMedium}
            aria-label="Show the still or the clip"
          >
            <ToggleOption value="still">Still</ToggleOption>
            <ToggleOption value="clip">Clip</ToggleOption>
          </ToggleGroup>
        )}
        <ToolbarIconButton
          icon={<ChevronLeftIcon sx={{ fontSize: "1em" }} />}
          tooltip="Previous version"
          ariaLabel="Previous version"
          onClick={handlePrevious}
          disabled={index <= 0}
        />
        <Box sx={pagerSx} data-testid="shot-version-pager">
          {versions.length > 0 ? `${index + 1} / ${versions.length}` : "0 / 0"}
        </Box>
        <ToolbarIconButton
          icon={<ChevronRightIcon sx={{ fontSize: "1em" }} />}
          tooltip="Next version"
          ariaLabel="Next version"
          onClick={handleNext}
          disabled={index >= versions.length - 1}
        />
        <ZoomControls
          zoom={zoom}
          onZoomChange={handleZoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          buttonSize="small"
        />
        {/* Fingers drag the zoomed take directly; the buttons are for
            pointers and keyboards. */}
        <FlexRow
          role="group"
          aria-label="Pan controls"
          gap={SPACING.micro}
          sx={{ "@media (pointer: coarse)": { display: "none" } }}
        >
          <ToolbarIconButton
            icon={<ArrowUpwardIcon sx={{ fontSize: "1em" }} />}
            tooltip="Pan up"
            ariaLabel="Pan up"
            onClick={() => nudgePan(0, -PAN_STEP)}
            disabled={!previewed}
          />
          <ToolbarIconButton
            icon={<ArrowDownwardIcon sx={{ fontSize: "1em" }} />}
            tooltip="Pan down"
            ariaLabel="Pan down"
            onClick={() => nudgePan(0, PAN_STEP)}
            disabled={!previewed}
          />
          <ToolbarIconButton
            icon={<ArrowBackIcon sx={{ fontSize: "1em" }} />}
            tooltip="Pan left"
            ariaLabel="Pan left"
            onClick={() => nudgePan(-PAN_STEP, 0)}
            disabled={!previewed}
          />
          <ToolbarIconButton
            icon={<ArrowForwardIcon sx={{ fontSize: "1em" }} />}
            tooltip="Pan right"
            ariaLabel="Pan right"
            onClick={() => nudgePan(PAN_STEP, 0)}
            disabled={!previewed}
          />
        </FlexRow>
        {versions.length > 0 && (
          <Caption color="secondary">
            {isCurrent
              ? `Take ${index + 1}, current ${shown}`
              : current
                ? `Previewing take ${index + 1}. Take ${acceptedIndex + 1}, current ${shown}`
                : `Previewing take ${index + 1}. No current ${shown}`}
          </Caption>
        )}
        {!readOnly && previewed && !isCurrent && (
          <EditorButton
            size="small"
            onClick={handleAccept}
            aria-label={`Set ${shown} ${index + 1} as current ${shown}`}
          >
            Set current
          </EditorButton>
        )}
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <>
            <ToolbarIconButton
              icon={<FlipIcon sx={{ fontSize: "1em" }} />}
              tooltip="Mirror this still as a new version"
              ariaLabel="Flip horizontal"
              onClick={() => void handleFlip()}
              disabled={!canEditStill}
            />
            <EditorButton
              size="small"
              onClick={() => void handleOpenImageEditor()}
              disabled={!canEditStill}
              title="Edit a copy of this still; the edit comes back as a new version"
            >
              Open in image editor
            </EditorButton>
          </>
        )}
      </FlexRow>
    </FlexColumn>
  );
};

export const ShotEditViewer = memo(ShotEditViewerInner);
ShotEditViewer.displayName = "ShotEditViewer";

export default ShotEditViewer;
