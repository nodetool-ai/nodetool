/**
 * ShotCard
 *
 * One cell of the storyboard's shot grid. The card carries only what reads at
 * a glance: the rendered clip or selected still, status, and render progress.
 * The description lives in the inspector opened by selecting the card.
 *
 * One row of controls sits on the media's top left: {@link ShotActions}, the
 * drag grip, the shot's actions (edit, regenerate the still, render a clip,
 * upload a still), fullscreen, and a menu for the rest. It swallows its
 * clicks, so reaching for an action never also selects the card. The
 * fullscreen viewer shows the same actions for the shot on screen.
 * `Edit` asks the board to open the shot's editor directly under this card
 * ({@link ShotEditPanel}).
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type {
  BoardRenderContext,
  ImageRef,
  Shot,
  VideoRef
} from "@nodetool-ai/protocol";
import { isAspectRatio } from "@nodetool-ai/protocol";

import ErrorBanner from "../support/ErrorBanner";
import {
  Box,
  Card,
  Caption,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  ProgressBar,
  ResponsiveImage,
  StatusPill,
  Text,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING,
  MOTION,
  reducedMotion,
  runningGradientAnimation,
  runningGradientBackground
} from "../ui_primitives";
import { colorForType } from "../../config/data_types";
import ShotDesignFrame from "./ShotDesignFrame";
import ShotActions, { shotPreviewClip } from "./ShotActions";
import ShotMediaViewer from "./ShotMediaViewer";
import ShotStatusPill, { CLIP_COLOR, isShotGenerating } from "./ShotStatusPill";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useResolvedMedia } from "../../hooks/useResolvedMediaUri";
import { formatDuration } from "../../utils/formatUtils";

interface ShotCardProps {
  boardId: string;
  shot: Shot;
  /**
   * `Scene N | Shot N` for this card, computed by the board from the derived
   * numbering (PRD § 7.7.3). The board owns the numbering, so the card is told
   * rather than counting shots it cannot see.
   */
  caption?: string;
  /**
   * The length this shot's clip renders at, in seconds. The board resolves it
   * from the linked script's takes or the shot's own value.
   */
  durationSeconds?: number;
  /**
   * This shot's part of a scene clip, as `Clip 2/3 · 4-9s`. The board
   * resolves scene clips, so the card is told its part.
   */
  sceneClipTag?: string;
  /**
   * The board values a version's render record is compared against, for the
   * stale marker on the pill. Passed in from where the board's models, style
   * and scenes already are.
   */
  renderContext?:
    | BoardRenderContext
    | ((shot: Shot) => BoardRenderContext)
    | null;
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
  /**
   * Opens this shot's editor. The board owns it, because it renders it under
   * this card's row — the card cannot place a panel outside its own cell.
   * Without it the card shows no edit affordances.
   */
  onEdit?: (shotId: string, focus: "fields" | "dialogue") => void;
}

/** The thumbnail: a fixed 16:9 media area every card in the grid shares. */
const mediaSx = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  bgcolor: "c_overlay_subtle",
  "& img": {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  }
} as const;

/**
 * The card selects on click; every control in the footer and the dialogs is
 * its own action, so their clicks stop before they reach it.
 */
const swallowClick = (event: React.MouseEvent): void => {
  event.stopPropagation();
};

/** Footer actions read as quiet text until hovered; the media is the card. */
/** True for a drag carrying files from outside the page. */
const isFileDrag = (event: React.DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");


const STILL_RENDER_COLORS = [
  colorForType("image"),
  colorForType("video"),
  colorForType("audio"),
  colorForType("text"),
  colorForType("image")
];

const ShotCardInner: React.FC<ShotCardProps> = ({
  boardId,
  shot,
  caption,
  durationSeconds,
  sceneClipTag,
  renderContext,
  selected,
  onSelect,
  readOnly,
  draggable,
  dropTarget,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onEdit
}) => {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const shotRenderContext =
    typeof renderContext === "function" ? renderContext(shot) : renderContext;
  const boardAspectRatio = shotRenderContext?.aspect_ratio;
  // The still or clip the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );

  // Why the last still or clip failed. Kept on the shot's job state until the
  // next attempt registers, so the card can say more than "failed".
  const failedJob = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? job : undefined;
  });
  const renderError = failedJob?.errorMessage;
  const progress = useStoryboardGenerationStore(
    (state) => state.shotJobs[shot.id]?.progress
  );
  const {
    generateKeyframe,
    generateClip,
    retryFailedRequest
  } = useGenerateShot();

  const failed = shot.status === "failed" || !!failedJob?.mediaEdit;
  const isGenerating = isShotGenerating(shot);
  const stillRendering = shot.status === "keyframe_generating";
  const previewClip = shotPreviewClip(shot);
  // The card shows the still's thumbnail; the full still is the viewer's.
  const keyframeMedia = useResolvedMedia(shot.keyframe);
  const keyframeThumbUri = keyframeMedia.thumbUrl ?? keyframeMedia.url;
  // A ref with neither a locator nor an asset behind it has nothing to show:
  // the card says so rather than waiting on a resolution that never lands.
  const hasKeyframe = Boolean(shot.keyframe?.uri || shot.keyframe?.asset_id);
  const shotNumber = new Intl.NumberFormat(
    i18n.resolvedLanguage ?? i18n.language
  ).format(shot.index + 1);
  const shotName = t("screens4_15.storyboard.shotCard.shotName", {
    number: shotNumber,
    title: shot.slug ?? t("screens4_15.storyboard.shotCard.untitledShot")
  });
  // What the preview shows is what fullscreen opens: the clip once there is
  // one, the selected still before that.
  const previewMedia: ImageRef | VideoRef | null =
    previewClip ?? shot.keyframe ?? null;

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
      if (failedJob) {
        void retryFailedRequest(failedJob.jobId).catch(() => undefined);
        return;
      }
      const retryClip = !!shot.keyframe;
      const run = retryClip ? generateClip : generateKeyframe;
      void run(boardId, shot).catch(() => undefined);
    },
    [
      failedJob,
      shot,
      generateClip,
      generateKeyframe,
      retryFailedRequest,
      boardId
    ]
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
      // Files dragged in from the desktop are not a card reorder: let the
      // browser refuse them rather than swallow the drop.
      if (isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      onDragEnter?.(shot.id);
    },
    [onDragEnter, shot.id]
  );
  // Without preventDefault on dragover the browser refuses the drop.
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    []
  );
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isFileDrag(event)) {
        return;
      }
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
      title={caption}
      aria-pressed={onSelect ? !!selected : undefined}
      data-shot-id={shot.id}
      data-focus-id={`storyboard-shot-${shot.id}`}
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
        position: "relative",
        borderRadius: BORDER_RADIUS.lg,
        borderColor:
          dropTarget || selected
            ? "primary.main"
            : isGenerating
              ? CLIP_COLOR
              : "divider",
        boxShadow: dropTarget
          ? `0 0 0 2px ${theme.vars.palette.primary.main}`
          : isGenerating
            ? `0 0 0 1px ${CLIP_COLOR}`
            : selected
              ? `0 0 0 1px ${theme.vars.palette.primary.main}`
              : undefined,
        cursor: draggable ? "grab" : undefined
      }}
    >
      <FlexColumn
        align="center"
        justify="center"
        sx={{
          ...mediaSx,
          // A stored ratio that is not "W:H" is invalid CSS, which would
          // leave the box with no height and the still invisible.
          aspectRatio: isAspectRatio(boardAspectRatio)
            ? boardAspectRatio.trim().replace(":", " / ")
            : mediaSx.aspectRatio
        }}
        onDoubleClick={previewMedia ? handleOpenViewer : undefined}
      >
        {shot.graphics && shot.graphics.mode !== "none" ? (
          <ShotDesignFrame
            hoverControls
            boardId={boardId}
            shot={
              previewClip && previewClip !== shot.clip
                ? { ...shot, clip: previewClip }
                : shot
            }
          />
        ) : previewClip ? (
          <Box sx={{ width: "100%", height: "100%" }} onClick={swallowClick}>
            <VideoPlayer
              locator={previewClip}
              poster={keyframeThumbUri ?? undefined}
              label={t("screens4_15.storyboard.shotCard.clipLabel", {
                shot: shotName
              })}
              prominentPlay
              hoverControls
            />
          </Box>
        ) : hasKeyframe ? (
          // The card is a few hundred pixels wide and a board holds dozens of
          // them, so it shows the asset's thumbnail, not the full still, and
          // leaves the ones below the fold to the browser's lazy loading. The
          // full still is one double-click away, in the viewer.
          <ResponsiveImage
            locator={shot.keyframe}
            preferThumbnail
            loading="lazy"
            showSkeleton
            alt={shotName}
            fit="cover"
            sx={{ height: "100%" }}
          />
        ) : (
          <Caption
            color="muted"
            role={stillRendering ? "status" : undefined}
            sx={{ textAlign: "center", p: SPACING.md }}
          >
            {stillRendering
              ? t("screens4_15.storyboard.shotCard.renderingStill")
              : t("screens4_15.storyboard.shotCard.noStill")}
          </Caption>
        )}
        {isGenerating && <MagicGenerationFill />}
        {stillRendering && (
          <Box
            data-testid="still-render-gradient"
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              p: SPACING.xs,
              borderRadius: BORDER_RADIUS.lg,
              pointerEvents: "none",
              background: runningGradientBackground(STILL_RENDER_COLORS),
              WebkitMask:
                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              animation: `${runningGradientAnimation} ${MOTION.pulse} infinite`,
              ...reducedMotion({ animation: "none" })
            }}
          />
        )}
        <ShotActions
          boardId={boardId}
          shot={shot}
          readOnly={readOnly}
          showDragHandle={draggable}
          onFullscreen={
            previewMedia && !isGenerating ? handleOpenViewer : undefined
          }
          onEdit={onEdit}
        />
        <ShotStatusPill
          shot={shot}
          renderContext={shotRenderContext}
          sx={{
            position: "absolute",
            right: SPACING.md,
            bottom: previewClip ? SPACING.xxxl : SPACING.md
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
              size="small"
              accent={CLIP_COLOR}
              aria-label={t("screens4_15.storyboard.shotCard.renderingClip")}
            />
          </Box>
        )}
      </FlexColumn>

      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.lg, minWidth: 0 }}>
        <FlexRow align="center" gap={SPACING.sm} wrap>
          <Caption color="secondary">
            {caption ?? t("screens4_15.storyboard.shotCard.shotNumber", {
              number: shotNumber
            })}
          </Caption>
          {durationSeconds != null && (
            <Caption
              color="secondary"
              data-testid="shot-card-duration"
              aria-label={t("screens4_15.storyboard.shotCard.duration", {
                count: durationSeconds,
                countLabel: new Intl.NumberFormat(
                  i18n.resolvedLanguage ?? i18n.language
                ).format(durationSeconds)
              })}
            >
              {formatDuration(durationSeconds * 1000)}
            </Caption>
          )}
          {sceneClipTag && (
            <StatusPill
              tone="neutral"
              data-testid="shot-scene-clip-tag"
              sx={{ borderColor: CLIP_COLOR }}
            >
              {sceneClipTag}
            </StatusPill>
          )}
        </FlexRow>
        <Text
          size="small"
          sx={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            minHeight: "2.7em"
          }}
        >
          {shot.action.trim() || t("screens4_15.storyboard.shotCard.noAction")}
        </Text>
      </FlexColumn>

      {failed && (
        <ErrorBanner
          data-testid="shot-render-error"
          sx={{ m: SPACING.lg, minWidth: 0 }}
          onRetry={readOnly ? undefined : handleRetry}
          retryLabel={t("screens4_15.storyboard.shotCard.retry")}
          report={{
            source: "job-failure",
            summary: t("screens4_15.storyboard.shotCard.renderFailedSummary"),
            errorText: renderError ?? undefined
          }}
        >
          {renderError ?? t("screens4_15.storyboard.shotCard.renderFailed")}
        </ErrorBanner>
      )}
      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        readOnly={readOnly}
        onEdit={onEdit}
        onClose={handleCloseViewer}
      />
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
