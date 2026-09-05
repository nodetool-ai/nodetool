/**
 * ShotCard
 *
 * One cell of the storyboard's shot grid: the rendered clip or selected still
 * on top, the action line under it. The card carries only what reads at a
 * glance — the shot number and length, a status pill, a render's progress —
 * and clicking it selects the shot, which opens {@link ShotInspector} under
 * the grid with the shot's prompt, takes, cast, and per-shot actions.
 */

import React, { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import {
  Box,
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  ProgressBar,
  Text,
  ToolbarIconButton,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import ShotMediaViewer from "./ShotMediaViewer";
import ShotStatusPill, { CLIP_COLOR, isShotGenerating } from "./ShotStatusPill";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useShotDuration } from "../../hooks/storyboard/useShotDuration";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";

interface ShotCardProps {
  boardId: string;
  shot: Shot;
  /** True when this card is the board's selected shot. */
  selected?: boolean;
  /** Selects (or, on the selected card, deselects) this shot. */
  onSelect?: (shotId: string) => void;
  /** Hide the per-shot actions (Retry) on a board that cannot be edited. */
  readOnly?: boolean;
  /** When set, the card can be dragged onto another card to reorder shots. */
  draggable?: boolean;
  /** True while another card is being dragged over this one. */
  dropTarget?: boolean;
  onDragStart?: (shotId: string) => void;
  onDragEnter?: (shotId: string) => void;
  onDragEnd?: () => void;
  /** Fired on the card a drag was released on. */
  onDrop?: (shotId: string) => void;
}

/** The thumbnail: a fixed 16:9 media area every card in the grid shares. */
const mediaSx = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  bgcolor: "c_overlay_subtle",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "& img": {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  }
} as const;

/** The `SH 01 · 3s` label, on a scrim so it reads over any still. */
const shotLabelSx = {
  position: "absolute",
  left: SPACING.md,
  top: SPACING.md,
  px: SPACING.sm,
  py: SPACING.micro,
  borderRadius: BORDER_RADIUS.xs,
  bgcolor: "c_scrim_soft",
  color: "text.secondary",
  ...TYPOGRAPHY.mono.caption
} as const;

/** The render bar sits on the thumbnail's bottom edge, 3px per the design. */
const RENDER_BAR_HEIGHT = 3;

const shotNumber = (shot: Shot): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")}`;

const ShotCardInner: React.FC<ShotCardProps> = ({
  boardId,
  shot,
  selected,
  onSelect,
  readOnly,
  draggable,
  dropTarget,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop
}) => {
  const theme = useTheme();
  // The still or clip the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );

  // Why the last still or clip failed. Kept on the shot's job state until the
  // next attempt registers, so the card can say more than "failed".
  const renderError = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? job.errorMessage : undefined;
  });
  // Which step failed, so Retry re-runs that one rather than guessing.
  const failedKind = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? job.kind : undefined;
  });
  const progress = useStoryboardGenerationStore(
    (state) => state.shotJobs[shot.id]?.progress
  );
  const { generateKeyframe, generateClip } = useGenerateShot();

  const failed = shot.status === "failed";
  const isGenerating = isShotGenerating(shot);
  const duration = useShotDuration(boardId, shot);
  // Whether there is a clip to show at all: the player itself resolves the
  // `asset://` locator, but the card renders the keyframe when it cannot.
  const clipUri = useResolvedMediaUri(shot.clip);
  const shotName = `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
  // What the preview shows is what fullscreen opens: the clip once there is
  // one, the selected still before that.
  const previewMedia: ImageRef | VideoRef | null = clipUri
    ? (shot.clip as VideoRef)
    : (shot.keyframe ?? null);

  const handleOpenViewer = useCallback(
    (event?: React.SyntheticEvent) => {
      // The card itself selects on click; opening the viewer is its own action.
      event?.stopPropagation();
      if (previewMedia) {
        setViewerMedia(previewMedia);
      }
    },
    [previewMedia]
  );
  const handleCloseViewer = useCallback(() => setViewerMedia(null), []);
  const handleSelect = useCallback(() => {
    onSelect?.(shot.id);
  }, [onSelect, shot.id]);

  // A start that throws records its reason on the shot's job state, which is
  // the line this button sits under — so the rejection is already shown.
  const handleRetry = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const retryClip =
        failedKind === "clip" || (!failedKind && !!shot.keyframe);
      const run = retryClip ? generateClip : generateKeyframe;
      void run(boardId, shot).catch(() => undefined);
    },
    [failedKind, shot, generateClip, generateKeyframe, boardId]
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", shot.id);
      onDragStart?.(shot.id);
    },
    [onDragStart, shot.id]
  );
  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDragEnter?.(shot.id);
    },
    [onDragEnter, shot.id]
  );
  // Without preventDefault on dragover the browser refuses the drop.
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    []
  );
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDrop?.(shot.id);
    },
    [onDrop, shot.id]
  );

  return (
    <Card
      variant="outlined"
      padding="none"
      clickable={!!onSelect}
      onClick={handleSelect}
      className="shot-card"
      aria-label={shotName}
      aria-pressed={onSelect ? !!selected : undefined}
      data-shot-id={shot.id}
      data-generating={isGenerating ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      draggable={draggable || undefined}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragEnter={draggable ? handleDragEnter : undefined}
      onDragOver={draggable ? handleDragOver : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onDrop={draggable ? handleDrop : undefined}
      sx={{
        overflow: "hidden",
        borderRadius: BORDER_RADIUS.lg,
        borderColor:
          dropTarget || selected
            ? "primary.main"
            : isGenerating
              ? CLIP_COLOR
              : "divider",
        boxShadow: dropTarget
          ? `0 0 0 2px ${theme.palette.primary.main}`
          : isGenerating
            ? `0 0 0 1px ${CLIP_COLOR}`
            : selected
              ? `0 0 0 1px ${theme.palette.primary.main}`
              : undefined,
        cursor: draggable ? "grab" : undefined
      }}
    >
      <Box
        sx={mediaSx}
        onDoubleClick={previewMedia ? handleOpenViewer : undefined}
      >
        {clipUri ? (
          <VideoPlayer locator={shot.clip} />
        ) : (
          <ImageRefPreview
            value={shot.keyframe}
            placeholder={
              <Caption
                color="muted"
                sx={{ textAlign: "center", p: SPACING.md }}
              >
                No still yet
              </Caption>
            }
          />
        )}
        <Box sx={shotLabelSx}>
          {duration.seconds != null
            ? `${shotNumber(shot)} · ${duration.seconds}s`
            : shotNumber(shot)}
        </Box>
        {previewMedia && !isGenerating && (
          <ToolbarIconButton
            icon={<FullscreenIcon sx={{ fontSize: "1em" }} />}
            tooltip="View fullscreen (double-click)"
            ariaLabel={
              clipUri ? "View clip fullscreen" : "View still fullscreen"
            }
            onClick={handleOpenViewer}
            sx={{
              position: "absolute",
              top: SPACING.xs,
              right: SPACING.xs,
              bgcolor: "c_scrim_soft",
              opacity: 0,
              ".shot-card:hover &": { opacity: 1 },
              "&:focus-visible": { opacity: 1 },
              // Touch devices cannot hover; keep the affordance reachable.
              "@media (pointer: coarse)": { opacity: 1 }
            }}
          />
        )}
        <ShotStatusPill
          shot={shot}
          sx={{
            position: "absolute",
            right: SPACING.md,
            bottom: SPACING.md
          }}
        />
        {isGenerating && (
          <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <ProgressBar
              value={progress ?? 0}
              progressVariant={
                progress == null ? "indeterminate" : "determinate"
              }
              showValue={false}
              sx={{
                height: RENDER_BAR_HEIGHT,
                backgroundColor: "c_overlay_subtle",
                "& .MuiLinearProgress-bar": { backgroundColor: CLIP_COLOR }
              }}
            />
          </Box>
        )}
      </Box>

      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.lg, minWidth: 0 }}>
        {failed && (
          <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
            <Caption
              role="alert"
              data-testid="shot-render-error"
              sx={{ color: "error.main", minWidth: 0 }}
            >
              {renderError ?? "The render failed. Try again."}
            </Caption>
            {!readOnly && (
              <EditorButton
                size="small"
                variant="outlined"
                onClick={handleRetry}
                sx={{ flexShrink: 0 }}
              >
                Retry
              </EditorButton>
            )}
          </FlexRow>
        )}
        <Text size="small" weight={400} lineClamp={2} sx={{ lineHeight: 1.45 }}>
          {shot.action}
        </Text>
      </FlexColumn>

      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        onClose={handleCloseViewer}
      />
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
