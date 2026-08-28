/**
 * ShotCard
 *
 * One shot in the storyboard, laid out as a full-width row: the keyframe
 * still or rendered clip on the left, and the shot's text, camera line,
 * cast, takes browser, and actions in the wide column beside it. There is
 * no approval step: the selected still (see {@link ShotTakesGallery}) is
 * what the clip render uses, so a shot is ready for video as soon as it
 * has a still.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import type { ImageRef, Shot, ShotStatus, VideoRef } from "@nodetool-ai/protocol";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

import {
  Box,
  Card,
  Caption,
  Chip,
  Dialog,
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexColumn,
  FlexRow,
  HoverActionGroup,
  StatusIndicator,
  Text,
  TextInput,
  ToolbarIconButton,
  VideoPlayer,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  reducedMotion,
  type StatusType
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import ShotMediaViewer from "./ShotMediaViewer";
import ShotTakesGallery from "./ShotTakesGallery";
import ShotScriptPanel from "./ShotScriptPanel";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useShotDuration } from "../../hooks/storyboard/useShotDuration";
import { useEntities } from "../../serverState/useEntities";
import {
  getEntityChipSx,
  getEntityKindDotSx
} from "../entities/entityKind";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";

interface ShotCardProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
  /** True when this is the first shot on the board (disables "move up"). */
  isFirst?: boolean;
  /** True when this is the last shot on the board (disables "move down"). */
  isLast?: boolean;
}

const STATUS_META: Record<
  ShotStatus,
  { status: StatusType; label: string; pulse?: boolean }
> = {
  planned: { status: "default", label: "Planned" },
  keyframe_generating: { status: "pending", label: "Generating still…", pulse: true },
  keyframe_ready: { status: "info", label: "Still ready" },
  // Legacy status from the removed approval step; same meaning as a ready still.
  approved: { status: "info", label: "Still ready" },
  clip_generating: { status: "pending", label: "Rendering…", pulse: true },
  rendered: { status: "success", label: "Rendered" },
  failed: { status: "error", label: "Failed" }
};

const previewSx = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: BORDER_RADIUS.sm,
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

const cardGridSx = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)",
  gap: SPACING.lg,
  alignItems: "start",
  "@media (max-width: 720px)": {
    gridTemplateColumns: "minmax(0, 1fr)"
  }
} as const;

/**
 * Secondary actions read as text rather than as a row of equal accent links;
 * only the step the shot has not taken yet keeps the accent.
 */
const quietActionSx = {
  color: "text.secondary",
  "&:hover": { color: "text.primary", bgcolor: "c_overlay_subtle" }
} as const;

/** Metadata chips carry no status color — the label is the whole signal. */
const quietChipSx = {
  borderRadius: BORDER_RADIUS.pill,
  color: "text.secondary",
  borderColor: "divider"
} as const;

/** The glow that travels around the frame while a still or clip renders. */
const borderOrbit = keyframes`
  0% { background-position: 0% 0%; }
  25% { background-position: 100% 0%; }
  50% { background-position: 100% 100%; }
  75% { background-position: 0% 100%; }
  100% { background-position: 0% 0%; }
`;

/**
 * Animated border for a shot whose still or clip is rendering: the card's
 * own border goes transparent and a pseudo-element paints a two-layer
 * background — paper over the interior, a radial-gradient tile above the
 * border ring. The tile is larger than the card, and the orbit keyframes
 * move it corner to corner, so the glow circles the frame.
 */
const generatingSx = (theme: Theme): Record<string, unknown> => ({
  position: "relative",
  outline: "none",
  border: "1px solid transparent",
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    pointerEvents: "none",
    backgroundImage: `linear-gradient(${theme.vars.palette.background.paper}, ${theme.vars.palette.background.paper}), radial-gradient(
      circle closest-side,
      ${theme.vars.palette.primary.light} 0%,
      ${theme.vars.palette.primary.main} 45%,
      transparent 100%
    )`,
    backgroundSize: "auto, 250% 250%",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "border-box",
    backgroundClip: "padding-box, border-box",
    animation: `${borderOrbit.name} ${MOTION.pulse} infinite`
  },
  ...reducedMotion({
    "&::before": { animation: "none" }
  })
});

const cameraLine = (shot: Shot): string =>
  [
    shot.camera?.framing,
    shot.camera?.lens,
    shot.camera?.angle,
    shot.camera?.movement
  ]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" · ");

const EMPTY_IDS: string[] = [];

const ShotCardInner: React.FC<ShotCardProps> = ({
  boardId,
  shot,
  readOnly,
  isFirst,
  isLast
}) => {
  const toggleShotEntity = useStoryboardStore((state) => state.toggleShotEntity);
  const updateShot = useStoryboardStore((state) => state.updateShot);
  const moveShot = useStoryboardStore((state) => state.moveShot);
  const removeShot = useStoryboardStore((state) => state.removeShot);
  const removeKeyframeVersion = useStoryboardStore(
    (state) => state.removeKeyframeVersion
  );
  const removeClipVersion = useStoryboardStore(
    (state) => state.removeClipVersion
  );
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? EMPTY_IDS
  );
  const { data: allEntities } = useEntities();
  const { generateKeyframe, generateClip, generateRevisedClip } =
    useGenerateShot();

  const { boardEntities, appliedIds } = useMemo(() => {
    const idSet = new Set(boardEntityIds);
    const board = (allEntities ?? []).filter((e) => idSet.has(e.id));
    return {
      boardEntities: board,
      appliedIds: entitiesForShot(shot, board).map((e) => e.id)
    };
  }, [allEntities, boardEntityIds, shot]);

  const [reviseOpen, setReviseOpen] = useState(false);
  // Anchor for the overflow menu holding the destructive take actions; null
  // when it is closed.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [reviseText, setReviseText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The still or clip the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );

  const meta = STATUS_META[shot.status];
  const theme = useTheme();
  // Why the last still or clip failed. Kept on the shot's job state until the
  // next attempt registers, so the card can say more than "Failed".
  const renderError = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? job.errorMessage : undefined;
  });
  const failed = shot.status === "failed";
  const isGenerating =
    shot.status === "keyframe_generating" || shot.status === "clip_generating";
  const camera = cameraLine(shot);
  // Whether there is a clip to show at all: the player itself resolves the
  // `asset://` locator, but the card renders the keyframe when it cannot.
  const clipUri = useResolvedMediaUri(shot.clip);
  const shotName = `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
  // What the preview shows is what fullscreen opens: the clip once there is
  // one, the selected still before that.
  const previewMedia: ImageRef | VideoRef | null = clipUri
    ? (shot.clip as VideoRef)
    : (shot.keyframe ?? null);
  const handleOpenViewer = useCallback(() => {
    if (previewMedia) {
      setViewerMedia(previewMedia);
    }
  }, [previewMedia]);
  const handleCloseViewer = useCallback(() => setViewerMedia(null), []);

  // A start that throws records its reason on the shot's job state (and
  // toasts it), which is what `renderError` above shows — so the rejection is
  // already reported and only needs to not go unhandled.
  const handleGenerateStill = useCallback(() => {
    void generateKeyframe(boardId, shot).catch(() => undefined);
  }, [generateKeyframe, boardId, shot]);

  const handleGenerateClip = useCallback(() => {
    void generateClip(boardId, shot).catch(() => undefined);
  }, [generateClip, boardId, shot]);

  const handleReviseConfirm = useCallback(() => {
    const instruction = reviseText.trim();
    if (instruction.length > 0) {
      void generateRevisedClip(boardId, shot, instruction).catch(
        () => undefined
      );
    }
    setReviseOpen(false);
    setReviseText("");
  }, [reviseText, generateRevisedClip, boardId, shot]);

  const handleMoveUp = useCallback(() => {
    moveShot(boardId, shot.id, "up");
  }, [moveShot, boardId, shot.id]);

  const handleMoveDown = useCallback(() => {
    moveShot(boardId, shot.id, "down");
  }, [moveShot, boardId, shot.id]);

  // A shot covering script lines is timed by the takes under it unless the
  // user pins it; the chip says which, and clicking it switches.
  const duration = useShotDuration(boardId, shot);
  const linksLines = (shot.script_line_ids?.length ?? 0) > 0;
  const durationLabel =
    duration.seconds != null
      ? `${duration.seconds}s · ${duration.source === "audio" ? "from takes" : "manual"}`
      : "model default";
  // Camera and cost share one quiet line under the action text; neither is
  // worth a chip of its own.
  const metaLine = [
    camera.length > 0 ? camera : null,
    shot.cost_estimate != null ? `~$${shot.cost_estimate.toFixed(2)}` : null
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");

  const handleToggleDurationSource = useCallback(() => {
    updateShot(boardId, shot.id, {
      duration_source: shot.duration_source === "manual" ? "audio" : "manual"
    });
  }, [updateShot, boardId, shot.id, shot.duration_source]);

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget),
    []
  );
  const handleCloseMenu = useCallback(() => setMenuAnchor(null), []);

  const handleDelete = useCallback(() => {
    removeShot(boardId, shot.id);
    setConfirmDelete(false);
  }, [removeShot, boardId, shot.id]);

  const handleRemoveStill = useCallback(() => {
    setMenuAnchor(null);
    const versions =
      shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []);
    if (versions.length === 0 || !shot.keyframe) {
      return;
    }
    const selected = versions.findIndex((v) =>
      sameMediaRef(v, shot.keyframe as ImageRef)
    );
    const index = selected >= 0 ? selected : 0;
    removeKeyframeVersion(boardId, shot.id, index);
  }, [
    shot.keyframe,
    shot.keyframe_versions,
    removeKeyframeVersion,
    boardId,
    shot.id
  ]);

  const handleRemoveClip = useCallback(() => {
    setMenuAnchor(null);
    const versions = shot.clip_versions ?? (shot.clip ? [shot.clip] : []);
    if (versions.length === 0 || !shot.clip) {
      return;
    }
    const selected = versions.findIndex((v) =>
      sameMediaRef(v, shot.clip as VideoRef)
    );
    const index = selected >= 0 ? selected : 0;
    removeClipVersion(boardId, shot.id, index);
  }, [shot.clip, shot.clip_versions, removeClipVersion, boardId, shot.id]);

  return (
    <Card
      variant="outlined"
      padding="compact"
      className="shot-card"
      data-generating={isGenerating ? "true" : undefined}
      sx={{
        ...cardGridSx,
        ...(isGenerating ? generatingSx(theme) : undefined)
      }}
    >
      <Box sx={previewSx} onDoubleClick={previewMedia ? handleOpenViewer : undefined}>
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
        {failed && !isGenerating && !shot.keyframe && !shot.clip && (
          <FlexColumn
            align="center"
            justify="center"
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: "c_scrim_soft",
              p: SPACING.sm
            }}
          >
            <Caption sx={{ color: "error.main", textAlign: "center" }}>
              Render failed
            </Caption>
          </FlexColumn>
        )}
        {isGenerating && (
          <FlexColumn
            align="center"
            justify="center"
            gap={SPACING.sm}
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: "c_scrim_soft"
            }}
          >
            <Caption>
              {shot.status === "clip_generating"
                ? "Rendering clip…"
                : "Generating still…"}
            </Caption>
          </FlexColumn>
        )}
      </Box>

      <FlexColumn gap={SPACING.sm} sx={{ minWidth: 0 }}>
        <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
          <Text size="small" truncate sx={{ minWidth: 0 }}>
            {shotName}
          </Text>
          <FlexRow align="center" gap={SPACING.xs} sx={{ flexShrink: 0 }}>
            <StatusIndicator
              status={meta.status}
              label={meta.label}
              pulse={meta.pulse}
              labelTone={failed ? "status" : "muted"}
            />
            {!readOnly && (
              <HoverActionGroup
                triggerSelector=".shot-card:hover"
                gap={0}
                // Touch devices can't hover; keep the row actions (reorder,
                // delete) visible there instead of hiding behind the reveal.
                sx={{ "@media (pointer: coarse)": { opacity: 1 } }}
              >
                <ToolbarIconButton
                  icon={<ArrowUpwardIcon sx={{ fontSize: "1em" }} />}
                  tooltip="Move up"
                  ariaLabel="Move shot up"
                  onClick={handleMoveUp}
                  disabled={isFirst}
                />
                <ToolbarIconButton
                  icon={<ArrowDownwardIcon sx={{ fontSize: "1em" }} />}
                  tooltip="Move down"
                  ariaLabel="Move shot down"
                  onClick={handleMoveDown}
                  disabled={isLast}
                />
                <ToolbarIconButton
                  icon={<DeleteOutlineIcon sx={{ fontSize: "1em" }} />}
                  tooltip="Delete shot"
                  ariaLabel="Delete shot"
                  variant="error"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isGenerating}
                />
              </HoverActionGroup>
            )}
          </FlexRow>
        </FlexRow>

        {failed && (
          <Caption
            role="alert"
            data-testid="shot-render-error"
            sx={{ color: "error.main" }}
          >
            {renderError ?? "The render failed. Try again."}
          </Caption>
        )}

        <Text lineClamp={3} sx={{ lineHeight: 1.6 }}>
          {shot.action}
        </Text>

        {(metaLine.length > 0 || linksLines) && (
          <FlexRow align="center" gap={SPACING.sm} wrap>
            {metaLine.length > 0 && (
              <Caption color="secondary" noWrap>
                {metaLine}
              </Caption>
            )}
            {linksLines && (
              <Chip
                compact
                variant="outlined"
                label={durationLabel}
                sx={quietChipSx}
                title={
                  duration.source === "audio"
                    ? "Length comes from the takes of the lines this shot covers. Click to pin it to the shot's own duration."
                    : "Length is pinned to the shot's own duration. Click to take it from the lines this shot covers."
                }
                onClick={readOnly ? undefined : handleToggleDurationSource}
              />
            )}
          </FlexRow>
        )}

        {boardEntities.length > 0 && (
          <FlexRow gap={SPACING.micro} wrap>
            {boardEntities.map((entity) => {
              const applied = appliedIds.includes(entity.id);
              return (
                <Chip
                  key={entity.id}
                  compact
                  label={entity.name || "Untitled"}
                  variant="outlined"
                  icon={<Box sx={getEntityKindDotSx(entity.kind, applied)} />}
                  sx={getEntityChipSx(applied)}
                  title={
                    applied
                      ? `${entity.descriptor || entity.name}: click to exclude from this shot`
                      : `Click to include ${entity.name} in this shot`
                  }
                  onClick={
                    readOnly
                      ? undefined
                      : () =>
                          toggleShotEntity(boardId, shot.id, entity.id, appliedIds)
                  }
                />
              );
            })}
          </FlexRow>
        )}

        <ShotTakesGallery boardId={boardId} shot={shot} readOnly={readOnly} />

        <ShotScriptPanel boardId={boardId} shot={shot} readOnly={readOnly} />

        {!readOnly && (
          <FlexRow
            gap={SPACING.xs}
            align="center"
            wrap
            sx={{ mt: SPACING.xs }}
          >
            <EditorButton
              onClick={handleGenerateStill}
              disabled={isGenerating}
              sx={shot.keyframe ? quietActionSx : undefined}
            >
              {shot.keyframe ? "New still" : "Generate still"}
            </EditorButton>
            <EditorButton
              onClick={handleGenerateClip}
              disabled={isGenerating || !shot.keyframe}
              sx={shot.clip ? quietActionSx : undefined}
              title={
                shot.keyframe
                  ? "Animate the selected still into a clip"
                  : "Generate a still first"
              }
            >
              {shot.clip ? "New clip" : "Generate clip"}
            </EditorButton>
            {shot.clip && (
              <EditorButton
                onClick={() => setReviseOpen(true)}
                disabled={isGenerating}
                sx={quietActionSx}
              >
                Revise clip
              </EditorButton>
            )}
            {(shot.keyframe || shot.clip) && (
              <ToolbarIconButton
                icon={<MoreHorizIcon sx={{ fontSize: "1em" }} />}
                tooltip="More actions"
                ariaLabel="More shot actions"
                onClick={handleOpenMenu}
                disabled={isGenerating}
              />
            )}
          </FlexRow>
        )}
      </FlexColumn>

      <EditorMenu
        open={menuAnchor !== null}
        anchorEl={menuAnchor}
        onClose={handleCloseMenu}
      >
        {shot.keyframe && (
          <EditorMenuItem onClick={handleRemoveStill}>
            Remove still
          </EditorMenuItem>
        )}
        {shot.clip && (
          <EditorMenuItem onClick={handleRemoveClip}>
            Remove clip
          </EditorMenuItem>
        )}
      </EditorMenu>

      <Dialog
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        title="Revise clip"
        onConfirm={handleReviseConfirm}
        confirmText="Revise"
        confirmDisabled={reviseText.trim().length === 0}
      >
        <FlexColumn gap={SPACING.xs}>
          <Caption color="secondary">
            Describe the change to make. The current clip is re-rendered with
            your note applied.
          </Caption>
          <TextInput
            value={reviseText}
            placeholder="e.g. make it darker, add rain"
            onChange={(e) => setReviseText(e.target.value)}
            multiline
            rows={3}
            autoFocus
          />
        </FlexColumn>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete shot?"
        onConfirm={handleDelete}
        confirmText="Delete"
        destructive
      >
        <Text>
          {`Remove “${shotName}” from the board. Generated stills and clips stay in your asset library.`}
        </Text>
      </Dialog>
      <ShotMediaViewer media={viewerMedia} onClose={handleCloseViewer} />
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
