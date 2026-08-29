/**
 * ShotInspector
 *
 * The selected shot's detail, docked under the shot grid. Its top bar is the
 * selection footer — which shot is selected, where it appears in the
 * project's sibling documents, and the two actions that re-render it. Below
 * that sits everything the grid card no longer shows: the action line, the
 * camera and cost meta, the cast chips, the takes browser, the script lines
 * the shot covers, and the reorder/delete controls.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import type { ImageRef, Shot, ShotStatus, VideoRef } from "@nodetool-ai/protocol";
import { shotRenderMode } from "@nodetool-ai/protocol";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

import {
  Box,
  Caption,
  Chip,
  CloseButton,
  Dialog,
  Divider,
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexColumn,
  FlexRow,
  Panel,
  StatusIndicator,
  Text,
  TextInput,
  ToolbarIconButton,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  TYPOGRAPHY,
  type StatusType
} from "../ui_primitives";
import ShotTakesGallery from "./ShotTakesGallery";
import ShotScriptPanel from "./ShotScriptPanel";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import {
  useBoardScriptLines,
  useShotDuration
} from "../../hooks/storyboard/useShotDuration";
import { useEntities } from "../../serverState/useEntities";
import { getEntityChipSx, getEntityKindDotSx } from "../entities/entityKind";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";
import { useShotTimelineLink } from "../../hooks/storyboard/useShotTimelineLink";
import { isShotGenerating } from "./ShotStatusPill";
import { colorForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";

interface ShotInspectorProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
  /** True when the shot is first on the board (disables "move up"). */
  isFirst?: boolean;
  /** True when the shot is last on the board (disables "move down"). */
  isLast?: boolean;
  /** Clears the board's selection. */
  onClose?: () => void;
}

const STATUS_META: Record<
  ShotStatus,
  { status: StatusType; label: string; pulse?: boolean }
> = {
  planned: { status: "default", label: "Planned" },
  keyframe_generating: {
    status: "pending",
    label: "Generating still…",
    pulse: true
  },
  keyframe_ready: { status: "info", label: "Still ready" },
  // Legacy status from the removed approval step; same meaning as a ready still.
  approved: { status: "info", label: "Still ready" },
  clip_generating: { status: "pending", label: "Rendering…", pulse: true },
  rendered: { status: "success", label: "Rendered" },
  failed: { status: "error", label: "Failed" }
};

/** Sky — the app's colour for anything script- or voice-shaped. */
const SCRIPT_COLOR = colorForType("audio");

/** Violet — the app's colour for anything picture-shaped. */
const TIMELINE_COLOR = colorForType("video");

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

/** A cross-document link chip, tinted by the document type it points at. */
const linkChipSx = (color: string) =>
  ({
    height: `${CONTROL.height.xs}px`,
    borderRadius: BORDER_RADIUS.md,
    borderColor: hexToRgba(color, 0.35),
    color
  }) as const;

const scriptChipSx = linkChipSx(SCRIPT_COLOR);
const timelineChipSx = linkChipSx(TIMELINE_COLOR);

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

const ShotInspectorInner: React.FC<ShotInspectorProps> = ({
  boardId,
  shot,
  readOnly,
  isFirst,
  isLast,
  onClose
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
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
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

  const meta = STATUS_META[shot.status];
  const isGenerating = isShotGenerating(shot);
  const camera = cameraLine(shot);
  const shotName = `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
  const shotNumber = `SH ${String(shot.index + 1).padStart(2, "0")}`;

  // A start that throws records its reason on the shot's job state (and
  // toasts it), which is what the card's error line shows — so the rejection
  // is already reported and only needs to not go unhandled.
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

  // Where this shot lands in the project's other documents: the script line it
  // covers, and the clip it owns in the assembled cut.
  const scriptLines = useBoardScriptLines(boardId);
  const scriptLink = useMemo(() => {
    const ids = shot.script_line_ids ?? [];
    if (!scriptId || ids.length === 0) {
      return null;
    }
    const order = [...scriptLines.keys()];
    const first = ids
      .map((id) => ({ id, position: order.indexOf(id) }))
      .filter((entry) => entry.position >= 0)
      .sort((a, b) => a.position - b.position)[0];
    return {
      lineId: first?.id ?? null,
      label: first ? `Script · line ${first.position + 1}` : "Script"
    };
  }, [scriptId, scriptLines, shot.script_line_ids]);
  const timelineLink = useShotTimelineLink(boardId, shot.id);

  const handleOpenScript = useCallback(() => {
    if (!scriptId) {
      return;
    }
    // Park the line before the tab opens: the script pane reads the request as
    // it renders, and scrolls to the line rather than to the top.
    if (scriptLink?.lineId) {
      requestDocumentFocus({
        type: "script",
        ref: scriptId,
        lineId: scriptLink.lineId
      });
    }
    openTab({ type: "script", ref: scriptId, mode: "edit", title: "Script" });
  }, [openTab, scriptId, scriptLink]);

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
    <Panel padding="none" className="shot-inspector">
      <FlexRow
        align="center"
        gap={SPACING.lg}
        wrap
        sx={{
          minHeight: `${CONTROL.height.xl}px`,
          px: SPACING.xl,
          py: SPACING.md
        }}
      >
        <Box sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}>
          {`${shotNumber} selected`}
        </Box>
        <Divider orientation="vertical" flexItem />
        <Caption color="secondary">Appears in</Caption>
        {timelineLink && (
          <Chip
            compact
            variant="outlined"
            label={timelineLink.label}
            sx={timelineChipSx}
            onClick={timelineLink.open}
            title="Open the cut with this shot's clip selected"
          />
        )}
        {scriptLink && (
          <Chip
            compact
            variant="outlined"
            label={scriptLink.label}
            sx={scriptChipSx}
            onClick={handleOpenScript}
            title="Open the script this shot's lines come from"
          />
        )}
        {!timelineLink && !scriptLink && (
          <Caption color="muted">nothing yet</Caption>
        )}
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <>
            <EditorButton
              onClick={() => setReviseOpen(true)}
              disabled={isGenerating || !shot.clip}
              sx={quietActionSx}
              title={
                shot.clip
                  ? "Re-render this clip with a note applied"
                  : "Render a clip first"
              }
            >
              Revise take
            </EditorButton>
            <EditorButton
              variant="contained"
              color="primary"
              onClick={handleGenerateClip}
              disabled={
                isGenerating ||
                (!shot.keyframe && shotRenderMode(shot) !== "direct")
              }
              title={
                shot.keyframe
                  ? "Animate the selected still into a clip"
                  : shotRenderMode(shot) === "direct"
                    ? "Render a clip straight from the prompt"
                    : "Generate a still first, or set render mode to direct"
              }
            >
              {shot.clip ? "Re-render clip" : "Render clip"}
            </EditorButton>
          </>
        )}
        {onClose && (
          <CloseButton onClick={onClose} tooltip="Clear shot selection" />
        )}
      </FlexRow>

      <Divider />

      <FlexColumn gap={SPACING.md} sx={{ p: SPACING.xl, minWidth: 0 }}>
        <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
          <Text size="small" truncate sx={{ minWidth: 0 }}>
            {shotName}
          </Text>
          <FlexRow align="center" gap={SPACING.xs} sx={{ flexShrink: 0 }}>
            <StatusIndicator
              status={meta.status}
              label={meta.label}
              pulse={meta.pulse}
              labelTone={shot.status === "failed" ? "status" : "muted"}
            />
            {!readOnly && (
              <>
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
              </>
            )}
          </FlexRow>
        </FlexRow>

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
          <FlexRow gap={SPACING.xs} align="center" wrap>
            <EditorButton
              onClick={handleGenerateStill}
              disabled={isGenerating}
              sx={shot.keyframe ? quietActionSx : undefined}
            >
              {shot.keyframe ? "New still" : "Generate still"}
            </EditorButton>
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
          <EditorMenuItem onClick={handleRemoveClip}>Remove clip</EditorMenuItem>
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
    </Panel>
  );
};

export const ShotInspector = memo(ShotInspectorInner);
ShotInspector.displayName = "ShotInspector";

export default ShotInspector;
