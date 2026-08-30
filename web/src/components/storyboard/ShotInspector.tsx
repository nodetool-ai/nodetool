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
import type {
  ImageRef,
  Shot,
  ShotStatus,
  VideoRef
} from "@nodetool-ai/protocol";
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
  SelectField,
  TextInput,
  ToolbarIconButton,
  Tooltip,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  TYPOGRAPHY,
  type StatusType
} from "../ui_primitives";
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
  LENS_OPTIONS,
  MOVEMENT_OPTIONS,
  cameraOptions
} from "./cameraOptions";
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
import {
  useShotCostEstimate,
  type ShotCostEstimate
} from "../../hooks/storyboard/useShotCostEstimate";
import { formatUsd } from "@nodetool-ai/model-pricing";
import { useEntities } from "../../serverState/useEntities";
import { getEntityChipSx, getEntityKindDotSx } from "../entities/entityKind";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";
import { useShotTimelineLink } from "../../hooks/storyboard/useShotTimelineLink";
import { isShotGenerating } from "./ShotStatusPill";
import type { SxProps, Theme } from "@mui/material/styles";
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

const cameraFieldSx = { flex: "1 1 7rem", minWidth: "6.5rem" } as const;
const movementFieldSx = { flex: "1.6 1 9rem", minWidth: "8rem" } as const;
const durationFieldSx = { width: "6rem", flexShrink: 0 } as const;
const shotIndexSx = {
  ...TYPOGRAPHY.sans.title,
  color: "text.secondary",
  flexShrink: 0
} as const;
// The title reads as a title, not as a form field: the underline appears on
// hover and focus so the row stays quiet until it is being edited.
const shotTitleSx = {
  minWidth: 0,
  flex: 1,
  "& .MuiInputBase-input": TYPOGRAPHY.sans.title,
  "& .MuiInput-root:before": { borderBottomColor: "transparent" },
  "&:hover .MuiInput-root:before": { borderBottomColor: "divider" }
} as const;

const EMPTY_IDS: string[] = [];

/**
 * A text field that edits one shot field: it holds a draft while the user
 * types, writes on blur or Enter, and drops the draft on Escape. Committing on
 * every keystroke would put one undo step per character on the board.
 */
const useShotTextField = (
  stored: string,
  commit: (next: string) => void,
  multiline = false
) => {
  const [draft, setDraft] = useState<string | null>(null);
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(event.target.value),
    []
  );
  const handleBlur = useCallback(() => {
    if (draft === null) {
      return;
    }
    const next = draft.trim();
    setDraft(null);
    if (next !== stored) {
      commit(next);
    }
  }, [draft, stored, commit]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" && !(multiline && event.shiftKey)) {
        event.preventDefault();
        (event.target as HTMLInputElement).blur();
      } else if (event.key === "Escape") {
        setDraft(null);
      }
    },
    [multiline]
  );
  return {
    value: draft ?? stored,
    onChange: handleChange,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown
  };
};

/**
 * What rendering this shot costs, one figure per step: the still and the clip
 * are priced by different models and only the clip's moves with the shot's
 * length, so a single total hides which number a change affected.
 *
 * A step nothing prices shows a dash and says why in its tooltip — the board
 * has no model picked for it, or no catalog carries the one it has. Leaving it
 * out instead is what makes a missing clip cost look broken.
 */
const ShotCostLine: React.FC<{
  estimate: ShotCostEstimate;
  sx?: SxProps<Theme>;
}> = ({ estimate, sx }) => {
  const listPrice = (
    <Caption color="secondary">
      List price from the provider catalog. The render is billed by the provider
      at its own rates.
    </Caption>
  );

  if (estimate.source === "stored") {
    return (
      <Tooltip
        placement="top"
        title={
          <Text size="small">
            What the last render of this shot cost. Pick the board&apos;s still
            and clip models to estimate the next one.
          </Text>
        }
      >
        <Caption color="muted" noWrap sx={sx}>
          {`last render ${formatUsd(estimate.cost)}`}
        </Caption>
      </Tooltip>
    );
  }

  if (estimate.steps.length === 0) {
    return null;
  }

  const pricedCount = estimate.steps.filter(
    (step) => step.cost !== null
  ).length;

  return (
    <FlexRow align="center" gap={SPACING.sm} wrap sx={sx}>
      {estimate.steps.map((step) => (
        <Tooltip
          key={step.label}
          placement="top"
          title={
            <FlexColumn gap={SPACING.micro}>
              <Text size="small">
                {step.cost === null
                  ? `${step.label}: ${step.reason}`
                  : `${step.label}: ${step.breakdown ?? formatUsd(step.cost)}`}
              </Text>
              {step.cost !== null && (
                <>
                  {estimate.notes.map((note) => (
                    <Caption key={note} color="secondary">
                      {note}
                    </Caption>
                  ))}
                  {listPrice}
                </>
              )}
            </FlexColumn>
          }
        >
          <Caption color={step.cost === null ? "muted" : "secondary"} noWrap>
            {step.cost === null
              ? `${step.label} —`
              : `${step.label} ~${formatUsd(step.cost)}`}
          </Caption>
        </Tooltip>
      ))}
      {pricedCount > 1 && (
        <Caption color="muted" noWrap>
          {`total ~${formatUsd(estimate.cost)}`}
        </Caption>
      )}
    </FlexRow>
  );
};

const ShotInspectorInner: React.FC<ShotInspectorProps> = ({
  boardId,
  shot,
  readOnly,
  isFirst,
  isLast,
  onClose
}) => {
  const toggleShotEntity = useStoryboardStore(
    (state) => state.toggleShotEntity
  );
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
  // Cost sits in the same quiet line as the camera controls. A read-only
  // inspector has no controls, so there the camera reads as text beside it.
  // The figure stays one number; which step costs what is in its tooltip.
  const costEstimate = useShotCostEstimate(boardId, shot);

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

  // Each camera part edits on its own; the shot keeps the other three.
  const commitCamera = useCallback(
    (key: keyof NonNullable<Shot["camera"]>, next: string) => {
      const camera = { ...(shot.camera ?? {}), [key]: next };
      if (next === "") {
        delete camera[key];
      }
      updateShot(boardId, shot.id, {
        camera: Object.keys(camera).length > 0 ? camera : undefined
      });
    },
    [updateShot, boardId, shot.id, shot.camera]
  );
  const handleFramingChange = useCallback(
    (value: string) => commitCamera("framing", value),
    [commitCamera]
  );
  const handleLensChange = useCallback(
    (value: string) => commitCamera("lens", value),
    [commitCamera]
  );
  const handleAngleChange = useCallback(
    (value: string) => commitCamera("angle", value),
    [commitCamera]
  );
  const handleMovementChange = useCallback(
    (value: string) => commitCamera("movement", value),
    [commitCamera]
  );
  const framingOptions = useMemo(
    () => cameraOptions(FRAMING_OPTIONS, shot.camera?.framing ?? ""),
    [shot.camera?.framing]
  );
  const lensOptions = useMemo(
    () => cameraOptions(LENS_OPTIONS, shot.camera?.lens ?? ""),
    [shot.camera?.lens]
  );
  const angleOptions = useMemo(
    () => cameraOptions(ANGLE_OPTIONS, shot.camera?.angle ?? ""),
    [shot.camera?.angle]
  );
  const movementOptions = useMemo(
    () => cameraOptions(MOVEMENT_OPTIONS, shot.camera?.movement ?? ""),
    [shot.camera?.movement]
  );

  const titleField = useShotTextField(
    shot.slug ?? "",
    useCallback(
      (slug: string) => updateShot(boardId, shot.id, { slug }),
      [updateShot, boardId, shot.id]
    )
  );
  const actionField = useShotTextField(
    shot.action,
    useCallback(
      (action: string) => {
        if (action !== "") {
          updateShot(boardId, shot.id, { action });
        }
      },
      [updateShot, boardId, shot.id]
    ),
    true
  );

  // The shot's own length. Typing one pins the shot to it, so a linked board
  // stops timing this shot from the takes under it.
  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  const durationValue =
    durationDraft ??
    (shot.duration_seconds != null ? String(shot.duration_seconds) : "");
  const durationPlaceholder =
    duration.source === "audio" && duration.seconds != null
      ? String(duration.seconds)
      : "auto";

  const handleDurationChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setDurationDraft(event.target.value),
    []
  );

  const commitDuration = useCallback(() => {
    if (durationDraft === null) {
      return;
    }
    const raw = durationDraft.trim();
    setDurationDraft(null);
    if (raw === "") {
      // Clearing the field un-pins the shot too — otherwise it is left with
      // no duration and a stale `duration_source: "manual"`, which blocks a
      // linked shot from deriving one from its takes again. Same value the
      // "unpin" chip (handleToggleDurationSource) writes.
      updateShot(boardId, shot.id, {
        duration_seconds: undefined,
        duration_source: "audio"
      });
      return;
    }
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    const patch: Parameters<typeof updateShot>[2] = {
      duration_seconds: seconds
    };
    if (linksLines) {
      patch.duration_source = "manual";
    }
    updateShot(boardId, shot.id, patch);
  }, [durationDraft, updateShot, boardId, shot.id, linksLines]);

  const handleDurationKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") {
        (event.target as HTMLInputElement).blur();
      } else if (event.key === "Escape") {
        setDurationDraft(null);
      }
    },
    []
  );

  const handleToggleDurationSource = useCallback(() => {
    updateShot(boardId, shot.id, {
      duration_source: shot.duration_source === "manual" ? "audio" : "manual"
    });
  }, [updateShot, boardId, shot.id, shot.duration_source]);

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) =>
      setMenuAnchor(event.currentTarget),
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
          {readOnly ? (
            <Text size="small" truncate sx={{ minWidth: 0 }}>
              {shotName}
            </Text>
          ) : (
            <FlexRow
              align="center"
              gap={SPACING.xs}
              sx={{ minWidth: 0, flex: 1 }}
            >
              <Box sx={shotIndexSx}>{`${shot.index + 1}.`}</Box>
              <TextInput
                compact
                size="small"
                variant="standard"
                label="Shot title"
                hideLabel
                placeholder="Untitled shot"
                {...titleField}
                sx={shotTitleSx}
              />
            </FlexRow>
          )}
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

        {readOnly ? (
          <Text lineClamp={3} sx={{ lineHeight: 1.6 }}>
            {shot.action}
          </Text>
        ) : (
          <TextInput
            compact
            size="small"
            multiline
            minRows={2}
            label="Shot description"
            hideLabel
            placeholder="What the shot shows"
            {...actionField}
            sx={{ "& .MuiInputBase-input": { lineHeight: 1.6 } }}
          />
        )}

        {readOnly ? (
          camera.length > 0 || duration.seconds != null ? (
            <FlexRow align="center" gap={SPACING.sm} wrap>
              {camera.length > 0 && (
                <Caption color="secondary" noWrap>
                  {camera}
                </Caption>
              )}
              {duration.seconds != null && (
                <Caption color="secondary" noWrap>
                  {durationLabel}
                </Caption>
              )}
              <ShotCostLine estimate={costEstimate} />
            </FlexRow>
          ) : null
        ) : (
          <FlexRow align="flex-end" gap={SPACING.sm} wrap>
            <Box sx={cameraFieldSx}>
              <SelectField
                size="small"
                label="Framing"
                value={shot.camera?.framing ?? ""}
                onChange={handleFramingChange}
                options={framingOptions}
              />
            </Box>
            <Box sx={cameraFieldSx}>
              <SelectField
                size="small"
                label="Lens"
                value={shot.camera?.lens ?? ""}
                onChange={handleLensChange}
                options={lensOptions}
              />
            </Box>
            <Box sx={cameraFieldSx}>
              <SelectField
                size="small"
                label="Angle"
                value={shot.camera?.angle ?? ""}
                onChange={handleAngleChange}
                options={angleOptions}
              />
            </Box>
            <Box sx={movementFieldSx}>
              <SelectField
                size="small"
                label="Movement"
                value={shot.camera?.movement ?? ""}
                onChange={handleMovementChange}
                options={movementOptions}
              />
            </Box>
            <TextInput
              compact
              size="small"
              fullWidth={false}
              type="number"
              label="Length (s)"
              placeholder={durationPlaceholder}
              value={durationValue}
              onChange={handleDurationChange}
              onBlur={commitDuration}
              onKeyDown={handleDurationKeyDown}
              inputProps={{
                min: 1,
                step: 1,
                "aria-label": "Clip length in seconds"
              }}
              sx={durationFieldSx}
            />
            {linksLines && (
              <Chip
                compact
                variant="outlined"
                label={duration.source === "audio" ? "from takes" : "pinned"}
                sx={{ ...quietChipSx, mb: SPACING.micro }}
                title={
                  duration.source === "audio"
                    ? "Length comes from the takes of the lines this shot covers. Click to pin it to the shot's own duration."
                    : "Length is pinned to the shot's own duration. Click to take it from the lines this shot covers."
                }
                onClick={handleToggleDurationSource}
              />
            )}
            <ShotCostLine
              estimate={costEstimate}
              sx={{ mb: SPACING.micro }}
            />
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
                          toggleShotEntity(
                            boardId,
                            shot.id,
                            entity.id,
                            appliedIds
                          )
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
    </Panel>
  );
};

export const ShotInspector = memo(ShotInspectorInner);
ShotInspector.displayName = "ShotInspector";

export default ShotInspector;
