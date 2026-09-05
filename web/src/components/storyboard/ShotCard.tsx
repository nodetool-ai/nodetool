/**
 * ShotCard
 *
 * One cell of the storyboard's shot grid: the rendered clip or selected still
 * on top, the action line under it. The card carries only what reads at a
 * glance — the shot number and length, a status pill, a render's progress —
 * and clicking it selects the shot, which opens {@link ShotInspector} under
 * the grid with the shot's prompt, takes, cast, and per-shot actions.
 *
 * Two rows of controls sit on top of that: {@link ShotHoverToolbar} on the
 * still (drag grip, fullscreen, download, duplicate, delete) and the footer
 * under the action (Edit, Iterate, Regenerate, Upload). Both swallow their
 * clicks, so reaching for an action never also selects the card.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type {
  BoardRenderContext,
  Entity,
  ImageRef,
  Shot,
  VideoRef
} from "@nodetool-ai/protocol";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

import {
  Box,
  Card,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  ProgressBar,
  Text,
  TextInput,
  ToolbarIconButton,
  UploadButton,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import ShotActionText from "./ShotActionText";
import ShotHoverToolbar from "./ShotHoverToolbar";
import ShotMediaViewer from "./ShotMediaViewer";
import ShotStatusPill, { CLIP_COLOR, isShotGenerating } from "./ShotStatusPill";
import { downloadResolvedMedia, shotDownloadName } from "./shotMediaDownload";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useShotDuration } from "../../hooks/storyboard/useShotDuration";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { useEntities } from "../../serverState/useEntities";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useNotificationStore } from "../../stores/NotificationStore";
import { mediaRefFromAsset } from "../../utils/mediaRef";

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
  renderContext?: BoardRenderContext | null;
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

/**
 * The card selects on click; every control in the footer and the dialogs is
 * its own action, so their clicks stop before they reach it.
 */
const swallowClick = (event: React.MouseEvent): void => {
  event.stopPropagation();
};

/** Footer actions read as quiet text until hovered; the media is the card. */
const footerButtonSx = { minWidth: 0, px: SPACING.xs } as const;

/** The render bar sits on the thumbnail's bottom edge, 3px per the design. */
const RENDER_BAR_HEIGHT = 3;

const shotNumber = (shot: Shot): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")}`;

/** Nothing on this board, so a card with no cast reuses one empty array. */
const NO_ENTITY_IDS: string[] = [];

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
  onDrop
}) => {
  const theme = useTheme();
  // The still or clip the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [iterateOpen, setIterateOpen] = useState(false);
  const [iterateText, setIterateText] = useState("");

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
  const { generateKeyframe, generateClip, generateRevisedClip } =
    useGenerateShot();
  const duplicateShot = useStoryboardStore((state) => state.duplicateShot);
  const removeShot = useStoryboardStore((state) => state.removeShot);
  const setShotKeyframe = useStoryboardStore((state) => state.setShotKeyframe);
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? NO_ENTITY_IDS
  );
  const { data: allEntities } = useEntities();
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);

  // Which of the board's cast this shot carries — the same rule the render
  // path seasons the prompt with, so the chips say what the prompt will.
  const shotEntities: Entity[] = useMemo(() => {
    if (boardEntityIds.length === 0 || !allEntities) {
      return [];
    }
    const onBoard = new Set(boardEntityIds);
    return entitiesForShot(
      shot,
      allEntities.filter((entity) => onBoard.has(entity.id))
    );
  }, [allEntities, boardEntityIds, shot]);

  const failed = shot.status === "failed";
  const hasDialogue = (shot.dialogue ?? "").trim().length > 0;
  const isGenerating = isShotGenerating(shot);
  const duration = useShotDuration(boardId, shot);
  // Whether there is a clip to show at all: the player itself resolves the
  // `asset://` locator, but the card renders the keyframe when it cannot.
  const clipUri = useResolvedMediaUri(shot.clip);
  // Download needs a URL, not a locator, and the still's is not otherwise
  // resolved here — the preview primitive resolves its own.
  const keyframeUri = useResolvedMediaUri(shot.keyframe);
  const downloadUri = clipUri ?? keyframeUri;
  const downloadKind = clipUri ? "clip" : "still";
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

  const handleOpenDeleteConfirm = useCallback(() => setConfirmDelete(true), []);
  const handleCloseDeleteConfirm = useCallback(
    () => setConfirmDelete(false),
    []
  );
  const handleOpenIterate = useCallback(() => setIterateOpen(true), []);
  const handleCloseIterate = useCallback(() => setIterateOpen(false), []);

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

  // P4 replaces this with the Edit dialog (PRD § 7.5). Until then Edit and the
  // dialogue icon open the shot in the inspector, which holds the same fields.
  const handleEdit = useCallback(() => {
    onSelect?.(shot.id);
  }, [onSelect, shot.id]);

  const handleRegenerate = useCallback(() => {
    void generateKeyframe(boardId, shot).catch(() => undefined);
  }, [generateKeyframe, boardId, shot]);

  const handleIterateConfirm = useCallback(() => {
    const instruction = iterateText.trim();
    if (instruction.length > 0) {
      void generateRevisedClip(boardId, shot, instruction).catch(
        () => undefined
      );
    }
    setIterateOpen(false);
    setIterateText("");
  }, [iterateText, generateRevisedClip, boardId, shot]);

  // An uploaded image becomes a new take and the selected one — it never
  // replaces the still that was there (PRD § 7.5, criterion 15).
  const handleUpload = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) {
        return;
      }
      uploadAsset({
        file,
        onCompleted: (asset) =>
          setShotKeyframe(boardId, shot.id, mediaRefFromAsset(asset, "image")),
        onFailed: (error) =>
          useNotificationStore.getState().addNotification({
            type: "error",
            alert: true,
            dismissable: true,
            content: `The still could not be uploaded. ${error}`
          })
      });
    },
    [uploadAsset, setShotKeyframe, boardId, shot.id]
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
        <ShotHoverToolbar
          showDragHandle={draggable}
          onFullscreen={
            previewMedia && !isGenerating ? handleOpenViewer : undefined
          }
          fullscreenLabel={
            clipUri ? "View clip fullscreen" : "View still fullscreen"
          }
          onDownload={downloadUri ? handleDownload : undefined}
          downloadLabel={downloadKind}
          onDuplicate={readOnly ? undefined : handleDuplicate}
          onDelete={readOnly ? undefined : handleOpenDeleteConfirm}
        />
        <ShotStatusPill
          shot={shot}
          renderContext={renderContext}
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
        {caption && <Caption color="muted">{caption}</Caption>}
        <ShotActionText action={shot.action} entities={shotEntities} />
        {!readOnly && (
          <FlexRow
            align="center"
            gap={SPACING.micro}
            onClick={swallowClick}
            data-testid="shot-card-footer"
          >
            <EditorButton size="small" onClick={handleEdit} sx={footerButtonSx}>
              Edit
            </EditorButton>
            <EditorButton
              size="small"
              onClick={handleOpenIterate}
              disabled={isGenerating || !shot.clip}
              sx={footerButtonSx}
              title={
                shot.clip
                  ? "Re-render this clip with a note applied"
                  : "Render a clip first"
              }
            >
              Iterate
            </EditorButton>
            <ToolbarIconButton
              icon={<AutorenewIcon sx={{ fontSize: "1em" }} />}
              tooltip="Render a new still from this shot's fields"
              ariaLabel="Regenerate still"
              onClick={handleRegenerate}
              disabled={isGenerating}
            />
            <UploadButton
              onFileSelect={handleUpload}
              tooltip="Upload your own still"
              accept="image/*"
              multiple={false}
            />
            <Box sx={{ flex: 1 }} />
            <ToolbarIconButton
              icon={
                hasDialogue ? (
                  <ChatBubbleIcon sx={{ fontSize: "1em" }} />
                ) : (
                  <ChatBubbleOutlineIcon sx={{ fontSize: "1em" }} />
                )
              }
              tooltip={hasDialogue ? "Edit the dialogue" : "Add dialogue"}
              ariaLabel={hasDialogue ? "Edit dialogue" : "Add dialogue"}
              data-testid="shot-dialogue-icon"
              data-filled={hasDialogue ? "true" : undefined}
              onClick={handleEdit}
            />
          </FlexRow>
        )}
      </FlexColumn>

      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        onClose={handleCloseViewer}
      />

      {/* Both dialogs sit inside the card, so their clicks would bubble into
          its selection handler through the React tree. */}
      <Box onClick={swallowClick}>
        <Dialog
          open={iterateOpen}
          onClose={handleCloseIterate}
          title="Iterate on this clip"
          onConfirm={handleIterateConfirm}
          confirmText="Iterate"
          confirmDisabled={iterateText.trim().length === 0}
        >
          <FlexColumn gap={SPACING.xs}>
            <Caption color="secondary">
              Describe the change to make. The current clip is re-rendered with
              your note applied.
            </Caption>
            <TextInput
              value={iterateText}
              placeholder="e.g. make it darker, add rain"
              onChange={(event) => setIterateText(event.target.value)}
              multiline
              rows={3}
              autoFocus
            />
          </FlexColumn>
        </Dialog>

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
