/**
 * ShotCard
 *
 * One cell of the storyboard's shot grid. The card carries only what reads at
 * a glance: the rendered clip or selected still, status, and render progress.
 * The description lives in the inspector opened by selecting the card.
 *
 * One row of controls sits on the media's top left: {@link ShotHoverToolbar}
 * with the drag grip, the card's actions (edit, regenerate the still, render a
 * clip, upload a still), fullscreen, and a menu for the rest. It swallows its
 * clicks, so reaching for an action never also selects the card.
 * `Edit` asks the board to open the shot's editor directly under this card
 * ({@link ShotEditPanel}).
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type {
  BoardRenderContext,
  ImageRef,
  Shot,
  VideoRef
} from "@nodetool-ai/protocol";
import {
  resolveEffectiveProductionRequirement,
  shotRenderMode
} from "@nodetool-ai/protocol";
import { formatUsd } from "@nodetool-ai/model-pricing";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import {
  Box,
  Card,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  ProgressBar,
  ResponsiveImage,
  Text,
  ToolbarIconButton,
  UploadButton,
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
import ShotHoverToolbar from "./ShotHoverToolbar";
import ShotMediaViewer from "./ShotMediaViewer";
import ShotRenderDialog, { type ShotRenderStep } from "./ShotRenderDialog";
import ShotStatusPill, { CLIP_COLOR, isShotGenerating } from "./ShotStatusPill";
import { downloadResolvedMedia, shotDownloadName } from "./shotMediaDownload";
import { shotWorkflowMedia } from "./shotWorkflowMedia";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useBoardImageModel } from "../../hooks/storyboard/useShotCostEstimate";
import { priceRenderStep } from "../../hooks/storyboard/shotCostPricing";
import { STILL_RESOLUTION } from "../../hooks/storyboard/renderSpec";
import {
  useResolvedMedia,
  useResolvedMediaUri
} from "../../hooks/useResolvedMediaUri";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useNotificationStore } from "../../stores/NotificationStore";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import { captureLastFrame } from "./lastFrame";

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


/** The render bar sits on the thumbnail's bottom edge, 3px per the design. */
const RENDER_BAR_HEIGHT = 3;
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
  const shotRenderContext =
    typeof renderContext === "function" ? renderContext(shot) : renderContext;
  // The still or clip the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renderStep, setRenderStep] = useState<ShotRenderStep | null>(null);

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
  // The regenerate tooltip says what a still costs before its dialog opens:
  // the same per-step price the shot editor's cost line shows.
  const boardImageModel = useBoardImageModel(boardId);
  const stillCost = useMemo(
    () =>
      priceRenderStep(
        "Still",
        shot.still_model ?? boardImageModel,
        "still model",
        STILL_RESOLUTION,
        undefined,
        []
      ).cost,
    [shot.still_model, boardImageModel]
  );
  const duplicateShot = useStoryboardStore((state) => state.duplicateShot);
  const removeShot = useStoryboardStore((state) => state.removeShot);
  const setShotKeyframe = useStoryboardStore((state) => state.setShotKeyframe);
  const setShotStatus = useStoryboardStore((state) => state.setShotStatus);
  // The clip the previous shot ends on, for continuing this shot from its
  // last frame. Null while that shot has no clip; unused on the first shot.
  const previousClip = useStoryboardStore(
    useCallback(
      (state) =>
        state.boards[boardId]?.shots.find((s) => s.index === shot.index - 1)
          ?.clip ?? null,
      [boardId, shot.index]
    )
  );
  const previousClipUri = useResolvedMediaUri(previousClip);
  const appendShotKeyframeVersion = useStoryboardStore(
    (state) => state.appendShotKeyframeVersion
  );
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);

  const failed = shot.status === "failed" || !!failedJob?.mediaEdit;
  const isGenerating = isShotGenerating(shot);
  const stillRendering = shot.status === "keyframe_generating";
  // A keyframe shot animates its still, so its clip waits for one.
  const clipNeedsStill = shotRenderMode(shot) === "keyframe" && !shot.keyframe;
  // A rendered take can be previewed before the creator accepts it as the
  // shot's clip. Use the latest take when there is no accepted clip yet.
  const previewClip =
    resolveEffectiveProductionRequirement(undefined, shot.production)
      ?.media_strategy === "still_motion_graphics"
      ? undefined
      : (shot.clip ?? shot.clip_versions?.at(-1));
  const clipUri = useResolvedMediaUri(previewClip);
  // Download needs a URL, not a locator, and the still's is not otherwise
  // resolved here — the preview primitive resolves its own. Both forms of the
  // still come off one asset lookup: the full one is what a download and the
  // fullscreen viewer want, the thumbnail is what the card shows.
  const keyframeMedia = useResolvedMedia(shot.keyframe);
  const keyframeUri = keyframeMedia.url;
  const keyframeThumbUri = keyframeMedia.thumbUrl ?? keyframeMedia.url;
  const downloadUri = clipUri ?? keyframeUri;
  const downloadKind = clipUri ? "clip" : "still";
  // A ref with neither a locator nor an asset behind it has nothing to show:
  // the card says so rather than waiting on a resolution that never lands.
  const hasKeyframe = Boolean(shot.keyframe?.uri || shot.keyframe?.asset_id);
  const shotName = `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
  // What the preview shows is what fullscreen opens: the clip once there is
  // one, the selected still before that.
  const previewMedia: ImageRef | VideoRef | null =
    previewClip ?? shot.keyframe ?? null;
  const workflowMedia = useMemo(() => shotWorkflowMedia(shot), [shot]);

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

  const handleOpenDeleteConfirm = useCallback(() => setConfirmDelete(true), []);
  const handleCloseDeleteConfirm = useCallback(
    () => setConfirmDelete(false),
    []
  );
  const handleRenderStill = useCallback(() => setRenderStep("still"), []);
  const handleRenderClip = useCallback(() => setRenderStep("clip"), []);
  const handleCloseRender = useCallback(() => setRenderStep(null), []);

  const handleDownload = useCallback(() => {
    if (!downloadUri) {
      return;
    }
    void downloadResolvedMedia(
      downloadUri,
      shotDownloadName(shot.index, downloadKind, downloadUri)
    );
  }, [downloadUri, downloadKind, shot.index]);

  const handleDuplicate = useCallback(() => {
    duplicateShot(boardId, shot.id);
  }, [duplicateShot, boardId, shot.id]);

  const handleDeleteConfirmed = useCallback(() => {
    setConfirmDelete(false);
    removeShot(boardId, shot.id);
  }, [removeShot, boardId, shot.id]);

  const handleEdit = useCallback(
    () => onEdit?.(shot.id, "fields"),
    [onEdit, shot.id]
  );

  // An uploaded image becomes a candidate take. Current media changes only
  // when the creator explicitly accepts it in the takes gallery.
  const handleUpload = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) {
        return;
      }
      uploadAsset({
        file,
        onCompleted: (asset) =>
          appendShotKeyframeVersion(
            boardId,
            shot.id,
            mediaRefFromAsset(asset, "image")
          ),
        onFailed: (error) =>
          useNotificationStore.getState().addNotification({
            type: "error",
            alert: true,
            dismissable: true,
            content: `The still could not be uploaded. ${error}`
          })
      });
    },
    [uploadAsset, appendShotKeyframeVersion, boardId, shot.id]
  );

  // The previous shot's last frame becomes this shot's current still, so the
  // two clips cut on the same picture. Earlier stills stay as takes.
  const handleUseLastFrame = useCallback(() => {
    if (!previousClipUri) {
      return;
    }
    const reportFailure = (error: unknown): void =>
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        dismissable: true,
        content: `The last frame of shot ${shot.index} could not be used. ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    captureLastFrame(previousClipUri, `shot-${shot.index}-last-frame.png`)
      .then((file) =>
        uploadAsset({
          file,
          onCompleted: (asset) => {
            setShotKeyframe(boardId, shot.id, mediaRefFromAsset(asset, "image"));
            if (!shot.clip) {
              setShotStatus(boardId, shot.id, "keyframe_ready");
            }
          },
          onFailed: reportFailure
        })
      )
      .catch(reportFailure);
  }, [
    previousClipUri,
    shot.index,
    shot.id,
    shot.clip,
    uploadAsset,
    setShotKeyframe,
    setShotStatus,
    boardId
  ]);

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
          ? `0 0 0 2px ${theme.palette.primary.main}`
          : isGenerating
            ? `0 0 0 1px ${CLIP_COLOR}`
            : selected
              ? `0 0 0 1px ${theme.palette.primary.main}`
              : undefined,
        cursor: draggable ? "grab" : undefined
      }}
    >
      <FlexColumn
        align="center"
        justify="center"
        sx={{
          ...mediaSx,
          aspectRatio: (shotRenderContext?.aspect_ratio ?? "16:9").replace(
            ":",
            " / "
          )
        }}
        onDoubleClick={previewMedia ? handleOpenViewer : undefined}
      >
        {shot.graphics && shot.graphics.mode !== "none" ? (
          <ShotDesignFrame
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
              label={`${shotName} clip`}
              prominentPlay
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
            {stillRendering ? "Rendering still…" : "No still yet"}
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
        <ShotHoverToolbar
          showDragHandle={draggable}
          onFullscreen={
            previewMedia && !isGenerating ? handleOpenViewer : undefined
          }
          fullscreenLabel={
            previewClip ? "View clip fullscreen" : "View still fullscreen"
          }
          onRenderStill={readOnly ? undefined : handleRenderStill}
          onRenderClip={readOnly ? undefined : handleRenderClip}
          renderDisabled={isGenerating}
          onDownload={downloadUri ? handleDownload : undefined}
          downloadLabel={downloadKind}
          sendToWorkflowItems={workflowMedia}
          useLastFrame={
            readOnly || shot.index === 0
              ? undefined
              : {
                  label: `Use last frame of shot ${shot.index}`,
                  disabled: isGenerating || !previousClipUri,
                  onSelect: handleUseLastFrame
                }
          }
          onDuplicate={readOnly ? undefined : handleDuplicate}
          onDelete={readOnly ? undefined : handleOpenDeleteConfirm}
        >
          {!readOnly && (
            <>
              {onEdit && (
                <ToolbarIconButton
                  icon={<EditOutlinedIcon sx={{ fontSize: "1em" }} />}
                  tooltip="Edit shot"
                  ariaLabel="Edit shot"
                  onClick={handleEdit}
                />
              )}
              <ToolbarIconButton
                icon={<AutorenewIcon sx={{ fontSize: "1em" }} />}
                tooltip={`Render a new still and pick its model${
                  stillCost ? ` · about ${formatUsd(stillCost)}` : ""
                }`}
                ariaLabel="Regenerate still"
                onClick={handleRenderStill}
                disabled={isGenerating}
              />
              <ToolbarIconButton
                icon={<MovieOutlinedIcon sx={{ fontSize: "1em" }} />}
                tooltip={
                  clipNeedsStill
                    ? "Render a still first"
                    : "Render a clip and pick its model"
                }
                ariaLabel="Render clip"
                onClick={handleRenderClip}
                disabled={isGenerating || clipNeedsStill}
              />
              <UploadButton
                onFileSelect={handleUpload}
                tooltip="Upload your own still"
                accept="image/*"
                multiple={false}
              />
            </>
          )}
        </ShotHoverToolbar>
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
              sx={{
                height: RENDER_BAR_HEIGHT,
                backgroundColor: "c_overlay_subtle",
                "& .MuiLinearProgress-bar": { backgroundColor: CLIP_COLOR }
              }}
            />
          </Box>
        )}
      </FlexColumn>

      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.lg, minWidth: 0 }}>
        <Caption color="secondary">
          {caption ?? `Shot ${shot.index + 1}`}
        </Caption>
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
          {shot.action.trim() || "No action described"}
        </Text>
      </FlexColumn>

      {failed && (
        <FlexRow
          align="center"
          justify="space-between"
          gap={SPACING.sm}
          sx={{ p: SPACING.lg, minWidth: 0 }}
        >
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
      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        onClose={handleCloseViewer}
      />

      {/* The dialogs sit inside the card, so their clicks would bubble into
          its selection handler through the React tree. */}
      <Box onClick={swallowClick}>
        {/* Mounted only while open: it subscribes to both model catalogs. */}
        {renderStep && (
          <ShotRenderDialog
            boardId={boardId}
            shot={shot}
            step={renderStep}
            onClose={handleCloseRender}
          />
        )}

        <Dialog
          open={confirmDelete}
          onClose={handleCloseDeleteConfirm}
          title="Delete shot?"
          onConfirm={handleDeleteConfirmed}
          confirmText="Delete"
          destructive
        >
          <Text>
            {`Remove \u201C${shotName}\u201D from the board. Generated stills and clips stay in your asset library.`}
          </Text>
        </Dialog>
      </Box>
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
