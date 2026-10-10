/**
 * ShotEditPanel
 *
 * The shot editor the board opens in an overlay over itself. A header bar
 * carries the way back, the step to the previous and next shot, and the save
 * actions. Under it, the form sits in a left column (description, cast,
 * dialogue, shot details, an Advanced fold for notes and graphics, script
 * lines) and the viewer with
 * the takes gallery fills the right. Each column scrolls on its own.
 *
 * The two rows are a **draft**. Nothing typed here reaches the board until
 * `Save`, which writes the whole shot in one `updateShot` — one store update,
 * one undo step, so a creator who changes five fields undoes five fields
 * together rather than one keystroke at a time. `Regenerate` saves, then asks
 * for the still model and renders from what was saved, never from what is on
 * screen. Closing dirty asks.
 *
 * What is *not* draft state, because it is already a committed act: choosing a
 * version, deleting one, flipping, and uploading. Those write straight through,
 * as they do on the board.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { shotRenderMode } from "@nodetool-ai/protocol";
import type { Entity, Scene, Shot } from "@nodetool-ai/protocol";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  Box,
  Card,
  Caption,
  CollapsibleSection,
  Dialog,
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexColumn,
  FlexRow,
  Label,
  MenuItemPrimitive,
  ScrollArea,
  TabGroup,
  Text,
  TextInput,
  ToolbarIconButton,
  SPACING
} from "../ui_primitives";
import ShotGraphicsEditor from "./ShotGraphicsEditor";
import ShotEditViewer from "./ShotEditViewer";
import ShotEditTable, { ShotAdvancedFields } from "./ShotEditTable";
import ShotEntitiesField from "./ShotEntitiesField";
import ShotTakesGallery from "./ShotTakesGallery";
import ShotStillModifyPanel from "./ShotStillModifyPanel";
import ShotScriptPanel from "./ShotScriptPanel";
import ShotCostLine from "./ShotCostLine";
import ShotPromptPreview from "./ShotPromptPreview";
import ShotRenderDialog from "./ShotRenderDialog";
import {
  changedDraftKeys,
  conflictingDraftKeys,
  draftFromShot,
  isDraftDirty,
  isDurationInvalid,
  savedShot,
  shotPatchFromChangedDraft,
  shotPatchFromDraft,
  withCurrentDraftFields,
  type ShotDraft,
  type ShotDraftKey
} from "./shotDraft";
import {
  useStoryboardStore,
  type ShotDraftCommit
} from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { displayNumber, sceneOrder } from "../../lib/storyboard/sceneOrder";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import {
  useBoardScriptLines,
  useShotDuration
} from "../../hooks/storyboard/useShotDuration";
import { useShotCostEstimate } from "../../hooks/storyboard/useShotCostEstimate";
import { useEntities } from "../../serverState/useEntities";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { canTakeFocus } from "../../utils/browser";
import { getErrorMessage } from "../../utils/errorHandling";
import { isShotGenerating } from "./ShotStatusPill";

interface ShotEditPanelProps {
  boardId: string;
  /** The shot the panel edits — the card it sits under. */
  shotId: string;
  onClose: () => void;
  /**
   * Asks the board to move the panel under another shot. The panel cannot move
   * itself: where it sits is the board's grid placement, not its own state.
   * Without it, `Previous shot`/`Next shot` are not offered.
   */
  onShotChange?: (shotId: string) => void;
  /** Opens with the dialogue cell focused, for the card's dialogue icon. */
  focusDialogue?: boolean;
  readOnly?: boolean;
  /** A board-level transition that must pass through this panel's draft guard. */
  leaveRequest?: { id: number; shotId?: string } | null;
  onLeaveRequestComplete?: (result: "saved" | "discarded" | "cancelled") => void;
}

const EMPTY_IDS: string[] = [];
const EMPTY_SHOTS: Shot[] = [];
const EMPTY_SCENES: Scene[] = [];

/**
 * What the duration and cost hooks read while the dialog is closing and the
 * shot has already left the board. Both are pure functions of a shot, so a
 * blank one costs nothing and keeps the hook order stable.
 */
const PLACEHOLDER_SHOT: Shot = {
  type: "shot",
  id: "",
  index: 0,
  action: "",
  status: "planned"
};

/** Below this width the two columns stack and the body scrolls as one. */
const STACKED = "@container (max-width: 56rem)";

/** Back on the left, the shot and its steppers centred, actions right. */
const headerSx = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
  alignItems: "center",
  gap: SPACING.md,
  px: SPACING.xl,
  py: SPACING.md,
  borderBottom: "1px solid",
  borderColor: "divider",
  [STACKED]: {
    gridTemplateColumns: "minmax(0, 1fr)",
    justifyItems: "start"
  }
} as const;

/** The form column takes a fixed width, the viewer the rest. */
const columnsSx = {
  display: "grid",
  gridTemplateColumns: "minmax(20rem, 28rem) minmax(0, 1fr)",
  height: "100%",
  minHeight: 0,
  [STACKED]: {
    gridTemplateColumns: "minmax(0, 1fr)",
    height: "auto"
  }
} as const;

const formColumnSx = {
  height: "100%",
  p: SPACING.xl,
  borderRight: "1px solid",
  borderColor: "divider",
  [STACKED]: { height: "auto", borderRight: "none" }
} as const;

/** A fixed-height column: the stage gives way to the tools under it. */
const viewerColumnSx = {
  height: "100%",
  minHeight: 0,
  p: SPACING.xl,
  [STACKED]: { height: "auto" }
} as const;

/** Matches the form's `Shot details` heading. */
const sectionTitleSx = {
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 500,
  color: "text.disabled"
} as const;

/** The stage takes what the tools leave, down to a usable floor. */
const viewerSx = {
  flex: "1 1 0",
  minHeight: "14rem",
  [STACKED]: { flex: "none", height: "24rem" }
} as const;

/** The takes and the change tools scroll on their own, under the stage. */
const toolsSx = {
  flex: "0 1 auto",
  minHeight: 0,
  [STACKED]: { overflow: "visible" }
} as const;

const DRAFT_LABELS: Record<ShotDraftKey, string> = {
  slug: "Shot title",
  sceneId: "Slugline",
  lighting: "Scene lighting",
  action: "Description",
  dialogue: "Dialogue",
  durationSeconds: "Estimated running time",
  durationSource: "Duration source",
  framing: "Size",
  angle: "Perspective",
  movement: "Movement",
  equipment: "Equipment",
  lens: "Focal length",
  notes: "Notes",
  renderMode: "Render mode",
  graphics: "Graphics",
  motion: "Shot motion",
  endState: "End",
  sound: "Sound"
};

/** A render that could not start: the hook records the ones it knows about. */
const reportRenderFailure = (error: unknown): void => {
  useNotificationStore.getState().addNotification({
    type: "error",
    alert: true,
    dismissable: true,
    content: `Render did not start. ${getErrorMessage(error, "Try again.")}`
  });
};

/** A draft value as the conflict dialog shows it: names, not ids or objects. */
const formatDraftValue = (
  key: ShotDraftKey,
  value: ShotDraft[ShotDraftKey],
  sceneOptions: { value: string; label: string }[]
): string => {
  if (value === undefined || value === null || value === "") {
    return "Not set";
  }
  if (key === "sceneId") {
    return sceneOptions.find((option) => option.value === value)?.label ?? "Not set";
  }
  if (typeof value === "object") {
    return "Edited graphics";
  }
  return String(value);
};

type SideTab = "takes" | "change";

const SIDE_TABS: { value: SideTab; label: string }[] = [
  { value: "takes", label: "Takes" },
  { value: "change", label: "Change still" }
];

const ShotEditPanelInner: React.FC<ShotEditPanelProps> = ({
  boardId,
  shotId,
  onClose,
  onShotChange,
  focusDialogue,
  readOnly,
  leaveRequest,
  onLeaveRequestComplete
}) => {
  // What the panel is waiting on an answer for: a close, or a step to another
  // shot. Null while there is nothing pending.
  const [pending, setPending] = useState<{
    shotId?: string;
    requestId?: number;
    imageEditor?: boolean;
  } | null>(null);
  const [saveConflicts, setSaveConflicts] = useState<ShotDraftKey[]>([]);
  // The render a save conflict interrupted, run once the conflict is resolved.
  const conflictedRender = useRef<"still" | "clip" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const imageLeaveResolver = useRef<((allowed: boolean) => void) | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>("takes");

  const shots = useStoryboardStore(
    (state) => state.boards[boardId]?.shots ?? EMPTY_SHOTS
  );
  const scenes = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.scenes ?? EMPTY_SCENES
  );
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? EMPTY_IDS
  );
  const boardStyle = useStoryboardStore(
    (state) => state.boards[boardId]?.style ?? ""
  );
  const applyShotDraft = useStoryboardStore((state) => state.applyShotDraft);
  const nudgeShot = useStoryboardStore((state) => state.nudgeShot);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { generateClip } = useGenerateShot();
  const { data: allEntities } = useEntities();

  const shot = shots.find((s) => s.id === shotId);
  const scene = useMemo(
    () => scenes.find((s) => s.id === shot?.scene_id) ?? null,
    [scenes, shot?.scene_id]
  );

  // The draft, reset whenever the panel moves to a different shot. Keyed on
  // the shot id rather than the object so a store write behind the panel (a
  // landed render) does not wipe what is being typed.
  const [draft, setDraft] = useState<ShotDraft | null>(null);
  const [original, setOriginal] = useState<ShotDraft | null>(null);
  const draftedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!shot || draftedFor.current === shot.id) {
      return;
    }
    const next = draftFromShot(shot, scene);
    draftedFor.current = shot.id;
    setDraft(next);
    setOriginal(next);
  }, [shot, scene]);

  const dirty = !!draft && !!original && isDraftDirty(draft, original);

  const linksLines =
    !!scriptId && (shot?.script_line_ids?.length ?? 0) > 0;
  const previewShot = useMemo(
    () =>
      shot && draft
        ? savedShot(shot, shotPatchFromDraft(draft))
        : (shot ?? PLACEHOLDER_SHOT),
    [draft, shot]
  );
  const duration = useShotDuration(boardId, previewShot);
  const costEstimate = useShotCostEstimate(boardId, previewShot);
  const scriptLines = useBoardScriptLines(boardId);

  const { boardEntities, appliedIds } = useMemo(() => {
    const idSet = new Set(boardEntityIds);
    const onBoard = (allEntities ?? []).filter((e) => idSet.has(e.id));
    return {
      boardEntities: onBoard,
      appliedIds: shot
        ? entitiesForShot(shot, onBoard).map((e: Entity) => e.id)
        : EMPTY_IDS
    };
  }, [allEntities, boardEntityIds, shot]);

  const castNames = useMemo(
    () =>
      boardEntities
        .filter((entity) => appliedIds.includes(entity.id))
        .map((entity) => entity.name || "Untitled"),
    [boardEntities, appliedIds]
  );
  // The prompt preview reads the scene the draft points at, lit the way the
  // draft says: both are saved with the shot.
  const promptScene = useMemo((): Scene | null => {
    const target = scenes.find((s) => s.id === draft?.sceneId) ?? null;
    return target && draft ? { ...target, lighting: draft.lighting } : target;
  }, [scenes, draft]);

  const ordered = useMemo(
    () => sceneOrder(shots, scenes).flatMap((group) => group.shots),
    [shots, scenes]
  );
  const position = ordered.findIndex((s) => s.id === shotId);
  const numbering = shot
    ? displayNumber(shot, shots)
    : { scene: 0, shot: 0 };

  const sceneOptions = useMemo(
    () =>
      sceneOrder(shots, scenes).map((group, i) => ({
        value: group.sceneId ?? "",
        label: group.scene?.slugline || `SCENE ${i + 1}`
      })),
    [shots, scenes]
  );

  /**
   * Commit the draft. The § 7.7.2 fields go in one `updateShot`; the scene
   * header's two board-level operations run first when they changed. Returns
   * the shot as saved, so `Regenerate` renders those values and not the props'
   * stale copy.
   */
  const commit = useCallback((resolution?: "mine" | "current"): Shot | null => {
    if (!shot || !draft || !original || readOnly) {
      return shot ?? null;
    }
    const current = draftFromShot(shot, scene);
    const conflicts = conflictingDraftKeys(draft, original, current);
    if (conflicts.length > 0 && resolution === undefined) {
      setSaveConflicts(conflicts);
      return null;
    }
    const resolvedDraft =
      resolution === "current"
        ? withCurrentDraftFields(draft, current, conflicts)
        : draft;
    const changed = changedDraftKeys(resolvedDraft, original);
    const patch = shotPatchFromChangedDraft(resolvedDraft, original, shot);
    const commit: ShotDraftCommit = {
      shot: patch,
      sceneId: changed.includes("sceneId")
        ? resolvedDraft.sceneId
        : current.sceneId
    };
    if (changed.includes("lighting")) {
      commit.lighting = resolvedDraft.lighting.trim();
    }
    applyShotDraft(boardId, shot.id, commit);
    const mergedDraft = withCurrentDraftFields(current, resolvedDraft, changed);
    setDraft(mergedDraft);
    setOriginal(mergedDraft);
    setSaveConflicts([]);
    return savedShot(shot, patch);
  }, [
    shot,
    draft,
    original,
    readOnly,
    scene,
    applyShotDraft,
    boardId
  ]);

  const durationInvalid = !!draft && isDurationInvalid(draft.durationSeconds);

  const handleSave = useCallback(() => {
    if (durationInvalid) {
      return;
    }
    conflictedRender.current = null;
    commit();
  }, [commit, durationInvalid]);

  // A still render asks for its model first, opened on the shot as saved.
  const [stillRenderShot, setStillRenderShot] = useState<Shot | null>(null);
  const closeStillRender = useCallback(() => setStillRenderShot(null), []);
  const startRender = useCallback(
    (kind: "still" | "clip", saved: Shot) => {
      if (kind === "still") {
        setStillRenderShot(saved);
        return;
      }
      void generateClip(boardId, saved).catch(reportRenderFailure);
    },
    [generateClip, boardId]
  );

  const handleRegenerate = useCallback(() => {
    const saved = commit();
    conflictedRender.current = saved ? null : "still";
    if (saved) {
      startRender("still", saved);
    }
  }, [commit, startRender]);

  // Reordering inside a scene: the board offers it by drag, which no keyboard
  // reaches. Crossing a scene is the slugline dropdown above.
  const handleNudge = useCallback(
    (direction: "up" | "down") => {
      setMenuAnchor(null);
      if (shot) {
        nudgeShot(boardId, shot.id, direction);
      }
    },
    [nudgeShot, boardId, shot]
  );

  const handleRenderClip = useCallback(() => {
    setMenuAnchor(null);
    const saved = commit();
    conflictedRender.current = saved ? null : "clip";
    if (saved) {
      startRender("clip", saved);
    }
  }, [commit, startRender]);

  const completeLeave = useCallback(
    (
      target: {
        shotId?: string;
        requestId?: number;
        imageEditor?: boolean;
      },
      result: "saved" | "discarded"
    ) => {
      if (target.imageEditor) {
        imageLeaveResolver.current?.(true);
        imageLeaveResolver.current = null;
      } else if (target.shotId) {
        draftedFor.current = null;
        onShotChange?.(target.shotId);
      } else {
        onClose();
      }
      if (target.requestId !== undefined) {
        onLeaveRequestComplete?.(result);
      }
    },
    [onClose, onShotChange, onLeaveRequestComplete]
  );

  /** Go somewhere — another shot, or out — asking first when dirty. */
  const leave = useCallback(
    (target: {
      shotId?: string;
      requestId?: number;
      imageEditor?: boolean;
    }) => {
      if (dirty) {
        setPending(target);
        return;
      }
      completeLeave(target, "discarded");
    },
    [dirty, completeLeave]
  );

  const runPending = useCallback(
    (save: boolean) => {
      const target = pending;
      if (save) {
        const saved = commit();
        if (!saved) {
          return;
        }
      }
      setPending(null);
      if (!target) {
        return;
      }
      completeLeave(target, save ? "saved" : "discarded");
    },
    [pending, commit, completeLeave]
  );

  const keepEditing = useCallback(() => {
    const target = pending;
    setPending(null);
    if (target?.imageEditor) {
      imageLeaveResolver.current?.(false);
      imageLeaveResolver.current = null;
    }
    if (target?.requestId !== undefined) {
      onLeaveRequestComplete?.("cancelled");
    }
  }, [pending, onLeaveRequestComplete]);

  const resolveSaveConflicts = useCallback(
    (resolution: "mine" | "current") => {
      const saved = commit(resolution);
      const render = conflictedRender.current;
      conflictedRender.current = null;
      if (saved && render) {
        startRender(render, saved);
      }
      if (saved && pending) {
        const target = pending;
        setPending(null);
        completeLeave(target, "saved");
      }
    },
    [commit, pending, completeLeave, startRender]
  );

  const requestImageEditorLeave = useCallback((): Promise<boolean> => {
    if (!dirty) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      imageLeaveResolver.current = resolve;
      setPending({ imageEditor: true });
    });
  }, [dirty]);

  const handledLeaveRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!leaveRequest || handledLeaveRequest.current === leaveRequest.id) {
      return;
    }
    handledLeaveRequest.current = leaveRequest.id;
    leave({ shotId: leaveRequest.shotId, requestId: leaveRequest.id });
  }, [leaveRequest, leave]);

  const handleClose = useCallback(() => leave({}), [leave]);

  const stepShot = useCallback(
    (delta: number) => {
      const next = ordered[position + delta];
      if (next) {
        leave({ shotId: next.id });
      }
    },
    [ordered, position, leave]
  );

  // `Cmd/Ctrl+S` saves, `Esc` closes — the overlay is not a MUI dialog, so it
  // listens for both itself. `←`/`→` step versions and are handled by the viewer, which
  // owns the still/clip toggle and the pager index (PRD § 7.5).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Every workspace tab stays mounted: a panel in a hidden tab must not
      // answer keys meant for the active one, nor cancel an IME composition.
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !canTakeFocus(panelRef.current)
      ) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
        return;
      }
      // While the discard question is up it owns Escape: answering it is what
      // closes the panel.
      if (event.key === "Escape" && pending === null) {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handleClose, pending]);

  const handleEditInScript = useCallback(() => {
    if (!scriptId || !shot) {
      return;
    }
    void requestImageEditorLeave().then((allowed) => {
      if (!allowed) {
        return;
      }
      const ids = shot.script_line_ids ?? [];
      const order = [...scriptLines.keys()];
      const first = ids
        .map((id) => ({ id, at: order.indexOf(id) }))
        .filter((entry) => entry.at >= 0)
        .sort((a, b) => a.at - b.at)[0];
      if (first) {
        requestDocumentFocus({
          type: "script",
          ref: scriptId,
          lineId: first.id
        });
      }
      openTab({
        type: "script",
        ref: scriptId,
        mode: "edit",
        title: "Script"
      });
      onClose();
    });
  }, [
    scriptId,
    shot,
    requestImageEditorLeave,
    scriptLines,
    openTab,
    onClose
  ]);

  if (!shot || !draft) {
    return null;
  }

  const generating = isShotGenerating(shot);
  // What each render button spends, on the button: the cost line beside them
  // sums both steps, and a click only pays for one.
  const stepCost = (label: string): string => {
    const cost = costEstimate.steps.find((step) => step.label === label)?.cost;
    return cost ? ` · ~${formatUsd(cost)}` : "";
  };
  const clipNeedsStill =
    shotRenderMode(previewShot) === "keyframe" && !shot.keyframe;
  const shotsInScene = shots.filter(
    (s) => (s.scene_id ?? null) === (shot.scene_id ?? null)
  ).length;

  const canStep = !!onShotChange;
  const canStepBack = canStep && position > 0;
  const canStepForward =
    canStep && position >= 0 && position < ordered.length - 1;

  const entityChips = (
    <ShotEntitiesField
      boardId={boardId}
      shotId={shot.id}
      boardEntities={boardEntities}
      appliedIds={appliedIds}
      boardEntityIds={boardEntityIds}
      readOnly={readOnly}
    />
  );

  return (
    <FlexColumn
      ref={panelRef}
      fullHeight
      className="shot-edit-panel"
      data-testid="shot-edit-panel"
      data-shot-id={shot.id}
      sx={{
        minWidth: 0,
        bgcolor: "background.default",
        containerType: "inline-size"
      }}
    >
      <Box sx={headerSx}>
        <EditorButton
          onClick={handleClose}
          startIcon={<ArrowBackIcon fontSize="small" />}
          sx={{ justifySelf: "start" }}
        >
          Back to storyboard
        </EditorButton>

        <FlexRow align="center" gap={SPACING.md}>
          {canStep && (
            <ToolbarIconButton
              icon={<ChevronLeftIcon />}
              tooltip="Previous shot"
              ariaLabel="Previous shot"
              onClick={() => stepShot(-1)}
              disabled={!canStepBack}
            />
          )}
          <FlexColumn align="center" sx={{ minWidth: 0 }}>
            <Text size="big" data-testid="shot-edit-title">
              {`Scene ${numbering.scene || "—"}, Shot ${numbering.shot || "—"}`}
            </Text>
          </FlexColumn>
          {canStep && (
            <ToolbarIconButton
              icon={<ChevronRightIcon />}
              tooltip="Next shot"
              ariaLabel="Next shot"
              onClick={() => stepShot(1)}
              disabled={!canStepForward}
            />
          )}
        </FlexRow>

        <FlexRow
          align="center"
          justify="flex-end"
          gap={SPACING.sm}
          wrap
          sx={{ justifySelf: "end", minWidth: 0 }}
        >
          <ShotCostLine estimate={costEstimate} />
          {!readOnly && (
            <>
              <ToolbarIconButton
                icon={<MoreHorizIcon sx={{ fontSize: "1em" }} />}
                tooltip="More actions"
                ariaLabel="More shot actions"
                onClick={(event) => setMenuAnchor(event.currentTarget)}
              />
              <EditorButton
                onClick={handleRegenerate}
                disabled={generating || durationInvalid}
                title={
                  generating ? "This shot is already rendering" : undefined
                }
              >
                {`Regenerate${stepCost("Still")}`}
              </EditorButton>
              <EditorButton
                variant="contained"
                color="primary"
                onClick={handleSave}
                disabled={!dirty || durationInvalid}
              >
                Save
              </EditorButton>
            </>
          )}
        </FlexRow>
      </Box>

      <ScrollArea thin sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={columnsSx}>
          <ScrollArea thin sx={formColumnSx}>
            <FlexColumn gap={SPACING.lg}>
              <ShotEditTable
                draft={draft}
                onChange={setDraft}
                entities={entityChips}
                linksLines={linksLines}
                takesDuration={duration.seconds ?? null}
                readOnly={readOnly}
                focusDialogue={focusDialogue}
                onEditInScript={linksLines ? handleEditInScript : undefined}
              />
              <Card variant="outlined" padding="normal">
                <CollapsibleSection
                  title={<Caption sx={sectionTitleSx}>Advanced</Caption>}
                  compact
                  defaultOpen={false}
                >
                  <FlexColumn gap={SPACING.lg} sx={{ pt: SPACING.md }}>
                    <ShotAdvancedFields
                      draft={draft}
                      onChange={setDraft}
                      readOnly={readOnly}
                    />
                    <TextInput
                      compact
                      size="small"
                      multiline
                      minRows={2}
                      label="Notes"
                      placeholder="Anything the render should not read as direction"
                      disabled={readOnly}
                      value={draft.notes}
                      onChange={(event) =>
                        setDraft({ ...draft, notes: event.target.value })
                      }
                    />
                    <ShotGraphicsEditor
                      shot={shot}
                      draft={draft}
                      onChange={setDraft}
                      readOnly={readOnly}
                    />
                  </FlexColumn>
                </CollapsibleSection>
              </Card>
              <ShotPromptPreview
                shot={previewShot}
                scene={promptScene}
                style={boardStyle}
                castNames={castNames}
              />
              <ShotScriptPanel
                boardId={boardId}
                shot={shot}
                readOnly={readOnly}
              />
            </FlexColumn>
          </ScrollArea>

          <FlexColumn gap={SPACING.lg} sx={viewerColumnSx}>
            <Box sx={viewerSx}>
              <ShotEditViewer
                boardId={boardId}
                shot={previewShot}
                readOnly={readOnly}
                onLeave={onClose}
                onBeforeImageEditor={requestImageEditorLeave}
              />
            </Box>
            {!readOnly && (
              <Box sx={{ flexShrink: 0 }}>
                <TabGroup
                  tabs={SIDE_TABS}
                  value={sideTab}
                  onChange={(value) => setSideTab(value as SideTab)}
                  size="small"
                  aria-label="Takes or change the still"
                />
              </Box>
            )}
            <ScrollArea thin sx={toolsSx}>
              {readOnly || sideTab === "takes" ? (
                <ShotTakesGallery
                  boardId={boardId}
                  shot={shot}
                  readOnly={readOnly}
                />
              ) : (
                <ShotStillModifyPanel boardId={boardId} shot={shot} />
              )}
            </ScrollArea>
          </FlexColumn>
        </Box>
      </ScrollArea>

      <EditorMenu
        open={menuAnchor !== null}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItemPrimitive
          compact
          label={`${shot.clip ? "Re-render clip" : "Render clip"}${stepCost("Clip")}`}
          secondary={
            generating
              ? "This shot is already rendering"
              : clipNeedsStill
                ? "Render a still first, or set render mode to Direct"
                : undefined
          }
          disabled={generating || clipNeedsStill}
          onClick={handleRenderClip}
        />
        <EditorMenuItem
          onClick={() => handleNudge("up")}
          disabled={numbering.shot <= 1}
        >
          Move earlier in scene
        </EditorMenuItem>
        <EditorMenuItem
          onClick={() => handleNudge("down")}
          disabled={numbering.shot >= shotsInScene}
        >
          Move later in scene
        </EditorMenuItem>
      </EditorMenu>

      {stillRenderShot && (
        <ShotRenderDialog
          boardId={boardId}
          shot={stillRenderShot}
          step="still"
          onClose={closeStillRender}
        />
      )}

      <Dialog
        open={pending !== null}
        onClose={keepEditing}
        title="Discard changes?"
        actions={
          <FlexRow align="center" gap={SPACING.sm}>
            <EditorButton onClick={keepEditing}>Keep editing</EditorButton>
            <EditorButton onClick={() => runPending(false)}>
              Discard
            </EditorButton>
            <EditorButton
              variant="contained"
              color="primary"
              onClick={() => runPending(true)}
            >
              Save
            </EditorButton>
          </FlexRow>
        }
      >
        <Text>This shot has edits that have not been saved.</Text>
        <Caption color="secondary">
          Version choices, deletions, flips and uploads are already saved.
        </Caption>
      </Dialog>

      <Dialog
        open={saveConflicts.length > 0}
        onClose={() => setSaveConflicts([])}
        title="This shot changed elsewhere"
        actions={
          <FlexRow align="center" gap={SPACING.sm} wrap>
            <EditorButton onClick={() => setSaveConflicts([])}>
              Keep editing
            </EditorButton>
            <EditorButton onClick={() => resolveSaveConflicts("current")}>
              Use current values
            </EditorButton>
            <EditorButton
              variant="contained"
              color="primary"
              onClick={() => resolveSaveConflicts("mine")}
            >
              Keep my changes
            </EditorButton>
          </FlexRow>
        }
      >
        <FlexColumn gap={SPACING.md}>
          <Text>
            The same fields changed after you opened this editor. Compare them
            before saving.
          </Text>
          {draft && original && shot &&
            saveConflicts.map((key) => {
              const current = draftFromShot(shot, scene);
              return (
                <FlexColumn key={key} gap={SPACING.xs}>
                  <Label>{DRAFT_LABELS[key]}</Label>
                  <Caption color="secondary">{`Your edit: ${formatDraftValue(key, draft[key], sceneOptions)}`}</Caption>
                  <Caption color="secondary">{`Current: ${formatDraftValue(key, current[key], sceneOptions)}`}</Caption>
                </FlexColumn>
              );
            })}
        </FlexColumn>
      </Dialog>
    </FlexColumn>
  );
};

export const ShotEditPanel = memo(ShotEditPanelInner);
ShotEditPanel.displayName = "ShotEditPanel";

export default ShotEditPanel;
