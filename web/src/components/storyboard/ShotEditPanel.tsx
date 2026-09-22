/**
 * ShotEditPanel
 *
 * `Edit your shot` — the editor the board opens **directly underneath the card
 * being edited**, spanning the grid's full width, rather than over the board in
 * a dialog: the shot stays on screen while its fields are edited. The viewer and
 * the takes gallery sit side by side, the § 7.7.2 table row and the scene header
 * row sit under them, and the linked script's lines sit under that.
 *
 * The two rows are a **draft**. Nothing typed here reaches the board until
 * `Save`, which writes the whole shot in one `updateShot` — one store update,
 * one undo step, so a creator who changes five fields undoes five fields
 * together rather than one keystroke at a time. `Regenerate` saves and then
 * renders from what was saved, never from what is on screen. Closing dirty
 * asks.
 *
 * What is *not* draft state, because it is already a committed act: choosing a
 * version, deleting one, flipping, and uploading. Those write straight through,
 * as they do on the board.
 *
 * The scene header row is the one part Save cannot fold in. Moving a shot
 * between scenes (`moveShot`) and editing a scene's lighting (`updateScene`)
 * are board-level operations with their own checkpoints, so a save that
 * changes the header writes those first and then the shot. The § 7.7.2 fields
 * — what criterion 14 measures — are always the single `updateShot`.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Entity, Scene, Shot } from "@nodetool-ai/protocol";
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
  Label,
  Panel,
  ScrollArea,
  SelectField,
  Text,
  TextInput,
  ToolbarIconButton,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import ShotEditViewer from "./ShotEditViewer";
import ShotEditTable from "./ShotEditTable";
import ShotTakesGallery from "./ShotTakesGallery";
import ShotScriptPanel from "./ShotScriptPanel";
import ShotCostLine from "./ShotCostLine";
import {
  changedDraftKeys,
  conflictingDraftKeys,
  draftFromShot,
  isDraftDirty,
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
import { getEntityChipSx, getEntityKindDotSx } from "../entities/entityKind";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";

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
  /** Opens the board's settings form, where the aspect ratio lives. */
  onOpenBoardSettings?: () => void;
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

/** The two columns: the viewer takes the room, the takes gallery a sidebar. */
const columnsSx = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(14rem, 1fr)",
  gap: SPACING.xl,
  minHeight: "22rem",
  "@container (max-width: 44rem)": {
    gridTemplateColumns: "minmax(0, 1fr)",
    minHeight: 0
  }
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
  renderMode: "Render mode"
};

const shotNumberSx = {
  ...TYPOGRAPHY.mono.caption,
  color: "text.secondary",
  flexShrink: 0
} as const;

const ShotEditPanelInner: React.FC<ShotEditPanelProps> = ({
  boardId,
  shotId,
  onClose,
  onShotChange,
  focusDialogue,
  readOnly,
  onOpenBoardSettings,
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
  const imageLeaveResolver = useRef<((allowed: boolean) => void) | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const shots = useStoryboardStore(
    (state) => state.boards[boardId]?.shots ?? EMPTY_SHOTS
  );
  const scenes = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.scenes ?? EMPTY_SCENES
  );
  const aspectRatio = useStoryboardStore(
    (state) => state.boards[boardId]?.aspectRatio ?? "16:9"
  );
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? EMPTY_IDS
  );
  const applyShotDraft = useStoryboardStore((state) => state.applyShotDraft);
  const nudgeShot = useStoryboardStore((state) => state.nudgeShot);
  const toggleShotEntity = useStoryboardStore(
    (state) => state.toggleShotEntity
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { generateKeyframe, generateClip } = useGenerateShot();
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
   * Moving to another scene brings that scene's lighting note with it — the
   * note belongs to the scene, so leaving the old one in the field would save
   * it onto the scene the shot just joined.
   */
  const handleSceneChange = useCallback(
    (value: string) => {
      const nextId = value === "" ? null : value;
      setDraft((current) =>
        current
          ? {
              ...current,
              sceneId: nextId,
              lighting:
                scenes.find((s) => s.id === nextId)?.lighting ?? ""
            }
          : current
      );
    },
    [scenes]
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

  const handleSave = useCallback(() => {
    commit();
  }, [commit]);

  const handleRegenerate = useCallback(() => {
    const saved = commit();
    if (saved) {
      void generateKeyframe(boardId, saved).catch(() => undefined);
    }
  }, [commit, generateKeyframe, boardId]);

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
    if (saved) {
      void generateClip(boardId, saved).catch(() => undefined);
    }
  }, [commit, generateClip, boardId]);

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
      if (saved && pending) {
        const target = pending;
        setPending(null);
        completeLeave(target, "saved");
      }
    },
    [commit, pending, completeLeave]
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

  // `Cmd/Ctrl+S` saves, `Esc` closes — the panel is not a dialog, so it listens
  // for both itself. `←`/`→` step versions and are handled by the viewer, which
  // owns the still/clip toggle and the pager index (PRD § 7.5).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

  const canStep = !!onShotChange;
  const canStepBack = canStep && position > 0;
  const canStepForward =
    canStep && position >= 0 && position < ordered.length - 1;

  return (
    <Panel
      padding={SPACING.xl}
      className="shot-edit-panel"
      data-testid="shot-edit-panel"
      data-shot-id={shot.id}
      sx={{ minWidth: 0, containerType: "inline-size" }}
    >
      <FlexColumn gap={SPACING.xl} sx={{ minWidth: 0 }}>
        <FlexRow align="center" gap={SPACING.md} wrap>
          <Text size="big">Edit your shot</Text>
          <Box sx={shotNumberSx}>
            {`SH ${String(shot.index + 1).padStart(2, "0")}`}
          </Box>
          {canStep && (
            <>
              <EditorButton
                onClick={() => stepShot(-1)}
                disabled={!canStepBack}
                title="Previous shot"
              >
                Previous shot
              </EditorButton>
              <EditorButton
                onClick={() => stepShot(1)}
                disabled={!canStepForward}
                title="Next shot"
              >
                Next shot
              </EditorButton>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <CloseButton onClick={handleClose} />
        </FlexRow>

        <Box sx={columnsSx}>
          <ShotEditViewer
            boardId={boardId}
            shot={shot}
            readOnly={readOnly}
            onLeave={onClose}
            onBeforeImageEditor={requestImageEditorLeave}
          />
          <ScrollArea>
            <ShotTakesGallery
              boardId={boardId}
              shot={shot}
              readOnly={readOnly}
            />
          </ScrollArea>
        </Box>

        <Divider />

        {/* Header row: which scene the shot belongs to, and how that scene is
            lit. Both are the scene's, shared by every shot under it. */}
        <FlexRow align="flex-end" gap={SPACING.lg} wrap>
          <Box sx={{ flex: "1 1 16rem", minWidth: 0 }}>
            <FlexColumn gap={SPACING.xs}>
              <Label sx={{ color: "text.secondary" }}>Slugline</Label>
              <SelectField
                size="small"
                label="Slugline"
                hideLabel
                disabled={readOnly || sceneOptions.length === 0}
                value={draft.sceneId ?? ""}
                onChange={handleSceneChange}
                options={sceneOptions}
              />
            </FlexColumn>
          </Box>
          <Box sx={{ flex: "1 1 12rem", minWidth: 0 }}>
            <FlexColumn gap={SPACING.xs}>
              <Label sx={{ color: "text.secondary" }}>Render mode</Label>
              <SelectField
                size="small"
                label="Render mode"
                hideLabel
                disabled={readOnly}
                value={draft.renderMode}
                onChange={(value) =>
                  setDraft({ ...draft, renderMode: value as "keyframe" | "direct" | "reference" })
                }
                options={[
                  { value: "keyframe", label: "Keyframe" },
                  { value: "direct", label: "Direct" },
                  { value: "reference", label: "Reference" }
                ]}
              />
            </FlexColumn>
          </Box>
          <Box sx={{ flex: "1 1 16rem", minWidth: 0 }}>
            <FlexColumn gap={SPACING.xs}>
              <Label sx={{ color: "text.secondary" }}>Lighting</Label>
              <TextInput
                compact
                size="small"
                label="Scene lighting"
                hideLabel
                placeholder="How the scene is lit"
                disabled={readOnly || !draft.sceneId}
                value={draft.lighting}
                onChange={(event) =>
                  setDraft({ ...draft, lighting: event.target.value })
                }
              />
            </FlexColumn>
          </Box>
          <Box sx={{ flex: "1 1 12rem", minWidth: 0 }}>
            <FlexColumn gap={SPACING.xs}>
              <Label sx={{ color: "text.secondary" }}>Shot title</Label>
              <TextInput
                compact
                size="small"
                label="Shot title"
                hideLabel
                placeholder="Untitled shot"
                disabled={readOnly}
                value={draft.slug}
                onChange={(event) =>
                  setDraft({ ...draft, slug: event.target.value })
                }
              />
            </FlexColumn>
          </Box>
        </FlexRow>

        <ShotEditTable
          draft={draft}
          onChange={setDraft}
          numbering={numbering}
          aspectRatio={aspectRatio}
          linksLines={linksLines}
          takesDuration={duration.seconds ?? null}
          readOnly={readOnly}
          focusDialogue={focusDialogue}
          onEditInScript={linksLines ? handleEditInScript : undefined}
          onOpenBoardSettings={onOpenBoardSettings}
        />

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

        <ShotScriptPanel boardId={boardId} shot={shot} readOnly={readOnly} />

        <Divider />

        <FlexRow align="center" gap={SPACING.sm} wrap>
          <ShotCostLine estimate={costEstimate} />
          <Box sx={{ flex: 1 }} />
          {!readOnly && (
            <>
              <ToolbarIconButton
                icon={<MoreHorizIcon sx={{ fontSize: "1em" }} />}
                tooltip="More actions"
                ariaLabel="More shot actions"
                onClick={(event) => setMenuAnchor(event.currentTarget)}
              />
              <EditorButton onClick={handleRegenerate}>Regenerate</EditorButton>
              <EditorButton
                variant="contained"
                color="primary"
                onClick={handleSave}
                disabled={!dirty}
              >
                Save
              </EditorButton>
            </>
          )}
        </FlexRow>
      </FlexColumn>

      <EditorMenu
        open={menuAnchor !== null}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
      >
        <EditorMenuItem onClick={handleRenderClip}>
          {shot.clip ? "Re-render clip" : "Render clip"}
        </EditorMenuItem>
        <EditorMenuItem
          onClick={() => handleNudge("up")}
          disabled={numbering.shot <= 1}
        >
          Move earlier in scene
        </EditorMenuItem>
        <EditorMenuItem onClick={() => handleNudge("down")}>
          Move later in scene
        </EditorMenuItem>
      </EditorMenu>

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
                  <Caption color="secondary">{`Your edit: ${String(draft[key] ?? "Not set")}`}</Caption>
                  <Caption color="secondary">{`Current: ${String(current[key] ?? "Not set")}`}</Caption>
                </FlexColumn>
              );
            })}
        </FlexColumn>
      </Dialog>
    </Panel>
  );
};

export const ShotEditPanel = memo(ShotEditPanelInner);
ShotEditPanel.displayName = "ShotEditPanel";

export default ShotEditPanel;
