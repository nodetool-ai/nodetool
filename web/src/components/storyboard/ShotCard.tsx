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
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import {
  Box,
  Card,
  Caption,
  Chip,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  HoverActionGroup,
  StatusIndicator,
  Text,
  TextInput,
  ToolbarIconButton,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING,
  type StatusType
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import ShotTakesGallery from "./ShotTakesGallery";
import ShotScriptPanel from "./ShotScriptPanel";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useShotDuration } from "../../hooks/storyboard/useShotDuration";
import { useEntities } from "../../serverState/useEntities";
import { ENTITY_KIND_COLOR } from "../entities/entityKind";
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
  gap: SPACING.md,
  alignItems: "start",
  "@media (max-width: 720px)": {
    gridTemplateColumns: "minmax(0, 1fr)"
  }
} as const;

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
  const [reviseText, setReviseText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = STATUS_META[shot.status];
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
  const handleToggleDurationSource = useCallback(() => {
    updateShot(boardId, shot.id, {
      duration_source: shot.duration_source === "manual" ? "audio" : "manual"
    });
  }, [updateShot, boardId, shot.id, shot.duration_source]);

  const handleDelete = useCallback(() => {
    removeShot(boardId, shot.id);
    setConfirmDelete(false);
  }, [removeShot, boardId, shot.id]);

  return (
    <Card
      variant="outlined"
      padding="compact"
      className="shot-card"
      sx={{
        ...cardGridSx,
        ...(isGenerating
          ? { outline: "1px solid", outlineColor: "primary.main" }
          : undefined)
      }}
    >
      <Box sx={previewSx}>
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
        <FlexRow align="center" justify="space-between" gap={SPACING.xs} wrap>
          <Text size="small" truncate>
            {shotName}
          </Text>
          <FlexRow align="center" gap={SPACING.xs}>
            {shot.cost_estimate != null && (
              <Chip
                compact
                color="info"
                label={`~$${shot.cost_estimate.toFixed(2)}`}
              />
            )}
            {linksLines && (
              <Chip
                compact
                color={duration.source === "audio" ? "info" : "default"}
                variant={duration.source === "audio" ? "filled" : "outlined"}
                label={durationLabel}
                sx={{ borderRadius: BORDER_RADIUS.sm }}
                title={
                  duration.source === "audio"
                    ? "Length comes from the takes of the lines this shot covers. Click to pin it to the shot's own duration."
                    : "Length is pinned to the shot's own duration. Click to take it from the lines this shot covers."
                }
                onClick={readOnly ? undefined : handleToggleDurationSource}
              />
            )}
            <StatusIndicator
              status={meta.status}
              label={meta.label}
              pulse={meta.pulse}
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

        <Text lineClamp={3}>{shot.action}</Text>

        {camera.length > 0 && (
          <Caption color="secondary" noWrap>
            {camera}
          </Caption>
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
                  color={applied ? ENTITY_KIND_COLOR[entity.kind] : "default"}
                  variant={applied ? "filled" : "outlined"}
                  sx={{
                    borderRadius: BORDER_RADIUS.sm,
                    ...(applied ? undefined : { opacity: 0.55 })
                  }}
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
          <FlexRow gap={SPACING.micro} wrap>
            <EditorButton
              onClick={handleGenerateStill}
              disabled={isGenerating}
            >
              {shot.keyframe ? "New still" : "Generate still"}
            </EditorButton>
            <EditorButton
              onClick={handleGenerateClip}
              disabled={isGenerating || !shot.keyframe}
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
              >
                Revise clip
              </EditorButton>
            )}
          </FlexRow>
        )}
      </FlexColumn>

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
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
