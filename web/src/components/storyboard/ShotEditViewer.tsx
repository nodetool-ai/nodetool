/**
 * ShotEditViewer
 *
 * The Edit Shot dialog's left column: the shot's selected still (or its clip,
 * when it has one) big enough to judge, with pan and zoom, a version pager,
 * and the two edits that produce a new take — mirror, and hand-off to the
 * image editor.
 *
 * Neither edit touches the version it started from. Both render or copy the
 * still into a fresh asset and append it through `setShotKeyframe`, so the
 * previous take is still in the takes gallery afterwards (criterion 15). The
 * paint tools are the image editor's, not a second raster editor of our own
 * (PRD D15).
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FlipIcon from "@mui/icons-material/Flip";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  ResponsiveImage,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  VideoPlayer,
  ZoomControls,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { isTextInputActive } from "../../utils/browser";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import { getErrorMessage } from "../../utils/errorHandling";
import { copiedStill, flippedStill } from "./shotImageEdits";

interface ShotEditViewerProps {
  boardId: string;
  shot: Shot;
  /** Hides every edit on a board that cannot be changed. */
  readOnly?: boolean;
  /** Closes the dialog when an action moves the creator to another tab. */
  onLeave?: () => void;
}

type Medium = "still" | "clip";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

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
  touchAction: "none",
  cursor: "grab",
  "&[data-panning='true']": { cursor: "grabbing" }
} as const;

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

const ShotEditViewerInner: React.FC<ShotEditViewerProps> = ({
  boardId,
  shot,
  readOnly,
  onLeave
}) => {
  const hasClip = !!shot.clip;
  const [medium, setMedium] = useState<Medium>(hasClip ? "clip" : "still");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const panFrom = useRef<{ x: number; y: number } | null>(null);

  const selectKeyframeVersion = useStoryboardStore(
    (state) => state.selectKeyframeVersion
  );
  const selectClipVersion = useStoryboardStore(
    (state) => state.selectClipVersion
  );
  const setShotKeyframe = useStoryboardStore((state) => state.setShotKeyframe);
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const shown: Medium = hasClip ? medium : "still";
  const versions = useMemo(() => versionsOf(shot, shown), [shot, shown]);
  const selected = shown === "clip" ? shot.clip : shot.keyframe;
  const position = selected
    ? versions.findIndex((v) => sameMediaRef(v, selected))
    : -1;
  const index = position >= 0 ? position : 0;

  // Flip and the editor hand-off both need bytes, and only the still has an
  // editable one; the player resolves its own.
  const stillUrl = useResolvedMediaUri(shot.keyframe);
  const stillName = `Shot ${shot.index + 1} still`;

  const step = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= versions.length) {
        return;
      }
      if (shown === "clip") {
        selectClipVersion(boardId, shot.id, next);
      } else {
        selectKeyframeVersion(boardId, shot.id, next);
      }
    },
    [
      index,
      versions.length,
      shown,
      selectClipVersion,
      selectKeyframeVersion,
      boardId,
      shot.id
    ]
  );

  const handlePrevious = useCallback(() => step(-1), [step]);
  const handleNext = useCallback(() => step(1), [step]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      panFrom.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pan.x, pan.y]
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
  const handlePointerUp = useCallback(() => {
    panFrom.current = null;
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
        setMedium(next);
      }
    },
    []
  );

  /** Upload a rendered still and make it the shot's newest take. */
  const addVersion = useCallback(
    (file: File, failure: string) =>
      uploadAsset({
        file,
        onCompleted: (asset) =>
          setShotKeyframe(boardId, shot.id, mediaRefFromAsset(asset, "image")),
        onFailed: (error) => reportFailure(error, failure)
      }),
    [uploadAsset, setShotKeyframe, boardId, shot.id]
  );

  // `←`/`→` step versions (PRD § 7.5). They live here rather than in the
  // dialog because the index and the still/clip toggle are this component's
  // state; a second copy in the shell would be a second source of truth.
  // Ignored while a text field has focus — they are that field's cursor keys.
  useEffect(() => {
    if (readOnly) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || isTextInputActive()) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readOnly, step]);

  const handleFlip = useCallback(async () => {
    if (!stillUrl) {
      return;
    }
    setBusy(true);
    try {
      addVersion(
        await flippedStill(stillUrl, `${stillName} flipped.png`),
        "The flip could not be saved."
      );
    } catch (error) {
      reportFailure(error, "The still could not be flipped.");
    } finally {
      setBusy(false);
    }
  }, [stillUrl, stillName, addVersion]);

  const handleOpenImageEditor = useCallback(async () => {
    if (!stillUrl) {
      return;
    }
    setBusy(true);
    try {
      const file = await copiedStill(stillUrl, `${stillName} edit.png`);
      uploadAsset({
        file,
        onCompleted: (asset) => {
          setShotKeyframe(boardId, shot.id, mediaRefFromAsset(asset, "image"));
          openTab({
            type: "image",
            ref: asset.id,
            mode: "edit",
            title: stillName
          });
          onLeave?.();
        },
        onFailed: (error) =>
          reportFailure(error, "The still could not be opened for editing.")
      });
    } catch (error) {
      reportFailure(error, "The still could not be opened for editing.");
    } finally {
      setBusy(false);
    }
  }, [
    stillUrl,
    stillName,
    uploadAsset,
    setShotKeyframe,
    boardId,
    shot.id,
    openTab,
    onLeave
  ]);

  const canEditStill = !readOnly && !!stillUrl && !busy;

  return (
    <FlexColumn gap={SPACING.md} fullHeight sx={{ minWidth: 0 }}>
      <Box
        sx={stageSx}
        data-panning={panFrom.current ? "true" : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="shot-edit-stage"
      >
        <Box
          sx={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center",
            maxWidth: "100%",
            maxHeight: "100%"
          }}
        >
          {shown === "clip" && shot.clip ? (
            <VideoPlayer locator={shot.clip} label={`Shot ${shot.index + 1}`} />
          ) : shot.keyframe ? (
            <ResponsiveImage
              locator={shot.keyframe}
              alt={`Shot ${shot.index + 1} still`}
              fit="contain"
            />
          ) : (
            <Caption color="muted">No still yet</Caption>
          )}
        </Box>
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
