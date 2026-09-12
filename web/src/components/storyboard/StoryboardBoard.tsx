/**
 * StoryboardBoard
 *
 * A compact toolbar over a grid of {@link ShotCard}s, grouped under scene
 * headers. The toolbar carries the board's name, its genre, a one-line
 * summary, and the actions that spend money (render stills, render clips);
 * the Screenplay/Direction form — including *Direct* — folds into a
 * collapsible section behind *Board settings*, open by default while the board
 * has no shots. What comes after the board — *Extract script*, *Assemble
 * timeline* — sits in a next-steps strip under the grid.
 *
 * The grid is a view of one stored order. `shot.index` is the whole order and
 * a scene is a contiguous run inside it (PRD § 7.7.3), so this file derives
 * groups and captions with {@link sceneOrder} and never writes an order of its
 * own: dropping a card is `moveShot(shotId, sceneId, position)` and the `+`
 * between cards is `insertShot(afterShotId)`. Both reindex in the store.
 *
 * Selecting a card opens the selection footer under the grid and scrolls it
 * into view; the arrow keys walk the selection along the grid.
 *
 * `Edit` on a card opens {@link ShotEditPanel} as a full-width row of the grid
 * placed immediately after that card, so the editor sits directly underneath
 * the shot it edits rather than over the board.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  shotRenderMode,
  requiredVideoTasksForShots
} from "@nodetool-ai/protocol";
import type { Shot, ShotModelRef } from "@nodetool-ai/protocol";
import AddIcon from "@mui/icons-material/Add";
import TuneIcon from "@mui/icons-material/Tune";

import { ASPECT_OPTIONS } from "./aspectOptions";

import {
  Box,
  Card,
  Caption,
  CloseButton,
  Collapse,
  Dialog,
  Divider,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  FormField,
  FormGrid,
  FormSection,
  LoadingSpinner,
  Panel,
  ScrollArea,
  SectionHeader,
  SelectField,
  Skeleton,
  Text,
  TextInput,
  Tooltip,
  UndoRedoButtons,
  BORDER_RADIUS,
  CONTROL,
  SPACING
} from "../ui_primitives";
import { formatUsd } from "@nodetool-ai/model-pricing";
import {
  useBoard,
  useStoryboardStore,
  useStoryboardCanUndo,
  useStoryboardCanRedo
} from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useStoryboardShotFocus } from "../../hooks/storyboard/useStoryboardShotFocus";
import {
  useImageModelsByProvider,
  useVideoModelsByProvider,
  type ImageModelTask,
  type VideoModelTask
} from "../../hooks/useModelsByProvider";
import { modelMatchesTask } from "../../hooks/modelTaskMatching";
import type { ImageModelValue, VideoModelValue } from "../../stores/ApiTypes";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import { useInStudio } from "../../studio/StudioContext";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useEntities } from "../../serverState/useEntities";
import { boardRenderContext } from "../../lib/storyboard/boardRenderContext";
import { exportStoryboardZip } from "../../utils/storyboardZip";
import {
  useRenderBatchCostEstimate,
  type RenderBatchCostEstimate
} from "../../hooks/storyboard/useRenderBatchCostEstimate";
import {
  sceneOrder,
  type SceneGroup
} from "../../lib/storyboard/sceneOrder";
import BoardGenreChip from "./BoardGenreChip";
import BoardLineageChip from "./BoardLineageChip";
import BoardRetryFailed from "./BoardRetryFailed";
import BoardStaleBanner from "./BoardStaleBanner";
import BoardStyleDialog from "./BoardStyleDialog";
import EntityStillModelWarning from "./EntityStillModelWarning";
import SceneHeader from "./SceneHeader";
import ScriptLinkControl from "./ScriptLinkControl";
import ShotCard from "./ShotCard";
import ShotEditPanel from "./ShotEditPanel";
import ShotInsertPoint, { SHOT_INSERT_POINT_CLASS } from "./ShotInsertPoint";
import ShotInspector from "./ShotInspector";
import StoryboardEntitiesField from "./StoryboardEntitiesField";
import { sceneDropTarget } from "./sceneDrop";
import { isShotNavigationKey, navigateShots } from "./shotOrder";
import {
  getRememberedModel,
  getRememberedModelForTask
} from "../../stores/lastModelStore";

// The preview mounts the timeline compositor; keep it out of the board bundle.
const LazyStoryboardPreview = React.lazy(() => import("./StoryboardPreview"));

interface StoryboardBoardProps {
  boardId: string;
  readOnly?: boolean;
  /** Wired by the parent to a Director run; receives the requested shot count. */
  onDirect?: (shotCount: number) => void;
  /** True while a Director run is in flight (disables and relabels the button). */
  directing?: boolean;
  /** Error from the last Director run, shown under the header fields. */
  directError?: string | null;
  /** Wired by the parent to the timeline handoff. */
  onAssemble?: () => void;
  /** True while assembly is in flight. */
  assembling?: boolean;
  /** Error from the last assembly, shown under the header fields. */
  assembleError?: string | null;
}

const SHOT_COUNT_OPTIONS = [3, 4, 5, 6, 8, 10, 12].map((n) => ({
  value: n,
  label: `${n} shots`
}));

// Stills can come from a plain generator or an editing model; the latter can
// take entity reference images, so the picker offers both.
const STILL_MODEL_TASKS: ImageModelTask[] = ["text_to_image", "image_to_image"];

const clipTaskForShot = (shot: Shot): VideoModelTask => {
  const mode = shotRenderMode(shot);
  return mode === "reference"
    ? "reference_to_video"
    : mode === "direct"
      ? "text_to_video"
      : "image_to_video";
};

/**
 * The clip tasks a board can ask for, keyed off the helper that produces them
 * so the labels cannot drift from it. A shot renders one of three ways; the
 * rest of `VideoModelTask` (revision, lip sync, upscaling, interpolation,
 * outpainting) never reaches this picker.
 */
type ClipModelTask = ReturnType<typeof requiredVideoTasksForShots>[number];

const CLIP_TASK_LABELS: Record<ClipModelTask, string> = {
  image_to_video: "Animate stills",
  text_to_video: "Generate from prompts",
  reference_to_video: "Use entity references"
};

const imageValue = (model: ShotModelRef): ImageModelValue => ({
  type: "image_model",
  id: model.id,
  provider: model.provider,
  name: model.name ?? model.id,
  path: ""
});

const videoValue = (model: ShotModelRef): VideoModelValue => ({
  type: "video_model",
  id: model.id,
  provider: model.provider,
  name: model.name ?? model.id
});

// The model pickers are custom buttons, not InputBase controls; hold them at
// the shared form-control height. Scoped to the picker's own class so no
// other button that ends up inside the field is affected.
const modelFieldSx = {
  "& .select-model-button": { minHeight: `${CONTROL.height.lg}px` }
} as const;

const FORM_STACK_BELOW = 860;

const settingsRailSx = {
  [`@media (min-width: ${FORM_STACK_BELOW + 1}px)`]: {
    paddingLeft: SPACING.xl,
    borderLeft: "1px solid",
    borderColor: "divider"
  }
} as const;

/** Four cards across at desktop width, down to one on a phone. */
const shotGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: SPACING.xl,
  alignItems: "start",
  "@media (max-width: 1280px)": {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
  },
  "@media (max-width: 960px)": {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
  },
  "@media (max-width: 600px)": {
    gridTemplateColumns: "minmax(0, 1fr)"
  }
} as const;

/**
 * The editor's row: the full width of the grid, directly under the card whose
 * shot it edits. The panel inside it spans the row the same way, so a narrow
 * viewport that drops the grid to one column needs no second rule.
 */
const editRowSx = {
  gridColumn: "1 / -1",
  minWidth: 0
} as const;

/**
 * One card's cell. It hosts the trailing insert point, which is revealed by
 * hover or by a keyboard focus landing anywhere inside the cell.
 */
const shotSlotSx = {
  position: "relative",
  [`&:hover .${SHOT_INSERT_POINT_CLASS}`]: { opacity: 1 },
  [`&:focus-within .${SHOT_INSERT_POINT_CLASS}`]: { opacity: 1 }
} as const;

/**
 * `Scene N | Shot N` for every card, from the groups the board already has.
 * `displayNumber` answers for one shot by grouping the whole board, so calling
 * it per card is quadratic on a long board. The numbering is identical, and
 * `StoryboardBoard.test.tsx` pins these captions against `displayNumber`.
 */
const captionsByShotId = (
  groups: readonly SceneGroup[]
): Map<string, string> => {
  const captions = new Map<string, string>();
  groups.forEach((group, sceneIndex) => {
    group.shots.forEach((shot, shotIndex) => {
      captions.set(shot.id, `Scene ${sceneIndex + 1} | Shot ${shotIndex + 1}`);
    });
  });
  return captions;
};

/**
 * A batch render button with what the click costs on it.
 *
 * The price sits in the label rather than beside it: a toolbar of buttons and
 * a floating figure leaves the reader to guess which button the figure belongs
 * to, and these two spend very different amounts. A batch nothing prices shows
 * the label alone and says why in the tooltip — a bare "—" next to a render
 * button reads as broken.
 */
interface RenderBatchButtonProps {
  label: string;
  estimate: RenderBatchCostEstimate;
  disabled: boolean;
  highlighted: boolean;
  onClick: () => void;
}

const RenderBatchButton: React.FC<RenderBatchButtonProps> = ({
  label,
  estimate,
  disabled,
  highlighted,
  onClick
}) => {
  const { shotCount, cost, pricedCount, reasons, notes } = estimate;
  const priced = pricedCount > 0 && cost > 0;
  const partial = priced && pricedCount < shotCount;

  return (
    <Tooltip
      placement="top"
      title={
        <FlexColumn gap={SPACING.micro}>
          <Text size="small">
            {priced
              ? `${shotCount} shot${shotCount === 1 ? "" : "s"} · about ${formatUsd(cost)}${
                  partial
                    ? ` (${pricedCount} of ${shotCount} priced — the rest are not in any catalog)`
                    : ""
                }`
              : `${shotCount} shot${shotCount === 1 ? "" : "s"}, none of them priced.`}
          </Text>
          {reasons.map((reason) => (
            <Caption key={reason} color="secondary">
              {reason}
            </Caption>
          ))}
          {priced &&
            notes.map((note) => (
              <Caption key={note} color="secondary">
                {note}
              </Caption>
            ))}
          {priced && (
            <Caption color="secondary">
              List price from the provider catalog. The render is billed by the
              provider at its own rates.
            </Caption>
          )}
        </FlexColumn>
      }
    >
      {/* A disabled button swallows pointer events, so the tooltip needs a host. */}
      <FlexRow component="span">
        <EditorButton
          variant={highlighted ? "contained" : "outlined"}
          color="primary"
          aria-current={highlighted ? "step" : undefined}
          onClick={onClick}
          disabled={disabled}
        >
          {`${label}${shotCount > 0 ? ` (${shotCount})` : ""}${
            priced ? ` · ~${formatUsd(cost)}` : ""
          }`}
        </EditorButton>
      </FlexRow>
    </Tooltip>
  );
};

const RenderCostSummary: React.FC<{
  estimate: RenderBatchCostEstimate;
}> = ({ estimate }) => {
  const { shotCount, cost, pricedCount, reasons, notes } = estimate;
  const priced = pricedCount > 0 && cost > 0;
  return (
    <FlexColumn gap={SPACING.micro}>
      <Text size="small">
        {priced
          ? `Estimated cost: about ${formatUsd(cost)}${
              pricedCount < shotCount
                ? ` (${pricedCount} of ${shotCount} shots priced)`
                : ""
            }`
          : "Select a priced model to see the batch estimate."}
      </Text>
      {reasons.map((reason) => (
        <Caption key={reason} color="secondary">
          {reason}
        </Caption>
      ))}
      {priced &&
        notes.map((note) => (
          <Caption key={note} color="secondary">
            {note}
          </Caption>
        ))}
    </FlexColumn>
  );
};

const StoryboardBoardInner: React.FC<StoryboardBoardProps> = ({
  boardId,
  readOnly,
  onDirect,
  directing,
  directError,
  onAssemble,
  assembling,
  assembleError
}) => {
  const {
    title,
    brief,
    style,
    genre,
    entityIds,
    aspectRatio,
    directorModel,
    imageModel,
    videoModel,
    screenplay,
    shots,
    activeShotId
  } = useBoard(boardId);

  // Land on the shot a script line or a cut clip linked to, once it has loaded.
  useStoryboardShotFocus(boardId);

  const inStudio = useInStudio();
  const setTitle = useStoryboardStore((state) => state.setTitle);
  const setBrief = useStoryboardStore((state) => state.setBrief);
  const setStyle = useStoryboardStore((state) => state.setStyle);
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);
  const setDirectorModel = useStoryboardStore(
    (state) => state.setDirectorModel
  );
  const setImageModel = useStoryboardStore((state) => state.setImageModel);
  const setVideoModel = useStoryboardStore((state) => state.setVideoModel);
  const selectShot = useStoryboardStore((state) => state.selectShot);
  const addShot = useStoryboardStore((state) => state.addShot);
  const insertShot = useStoryboardStore((state) => state.insertShot);
  const moveShot = useStoryboardStore((state) => state.moveShot);
  const undo = useStoryboardStore((state) => state.undo);
  const redo = useStoryboardStore((state) => state.redo);
  const canUndo = useStoryboardCanUndo(boardId);
  const canRedo = useStoryboardCanRedo(boardId);
  const onUndo = useCallback(() => undo(boardId), [undo, boardId]);
  const onRedo = useCallback(() => redo(boardId), [redo, boardId]);

  const [shotCount, setShotCount] = useState<number>(6);
  const [confirmRedirect, setConfirmRedirect] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const togglePreview = useCallback(() => setPreviewOpen((open) => !open), []);
  const [downloading, setDownloading] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const openStyle = useCallback(() => setStyleOpen(true), []);
  const closeStyle = useCallback(() => setStyleOpen(false), []);
  const [renderDialog, setRenderDialog] = useState<"stills" | "clips" | null>(
    null
  );
  const [stillSelection, setStillSelection] = useState<ImageModelValue | null>(
    null
  );
  const [clipSelections, setClipSelections] = useState<
    Partial<Record<VideoModelTask, VideoModelValue>>
  >({});
  const { models: imageModels } = useImageModelsByProvider();
  const { models: videoModels } = useVideoModelsByProvider();

  // Which shot's editor is open, and which cell it opened on. The board holds
  // this rather than the card, because the panel is a row of this grid: a card
  // cannot place a surface outside its own cell.
  const [editing, setEditing] = useState<{
    shotId: string;
    focus: "fields" | "dialogue";
  } | null>(null);
  const handleEditShot = useCallback(
    (shotId: string, focus: "fields" | "dialogue" = "fields") => {
      setEditing({ shotId, focus });
    },
    []
  );
  const handleEditShotFields = useCallback(
    (shotId: string) => handleEditShot(shotId, "fields"),
    [handleEditShot]
  );
  const closeEditing = useCallback(() => setEditing(null), []);
  // Stepping from the panel moves it under the shot it steps to; the focus goes
  // back to the fields, since the dialogue cell was this shot's request.
  const handleEditingShotChange = useCallback(
    (shotId: string) => setEditing({ shotId, focus: "fields" }),
    []
  );

  // The one grouping pass the render needs: the headers, the cards under each,
  // the captions, and the scene a drop resolves against all read it.
  const scenes = screenplay?.scenes;
  const sceneGroups = useMemo(() => sceneOrder(shots, scenes), [shots, scenes]);
  const captions = useMemo(() => captionsByShotId(sceneGroups), [sceneGroups]);

  const hasShots = shots.length > 0;

  // A board with no shots is a board being set up: the form is the surface.
  // Once shots exist the grid is, and the form folds behind the toolbar.
  const [settingsOpen, setSettingsOpen] = useState(!hasShots);
  const toggleSettings = useCallback(
    () => setSettingsOpen((open) => !open),
    []
  );
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const settingsPanelId = `storyboard-board-settings-${boardId}`;

  // The inspector docks under the grid, so on a board of more than a row or
  // two it opens below the fold. A selection the user makes here scrolls it
  // into view; one made from another document (useStoryboardShotFocus) does
  // not, because that already centres the card.
  const gridRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const editPanelRef = useRef<HTMLDivElement>(null);
  const revealInspector = useRef(false);
  useEffect(() => {
    if (!revealInspector.current) {
      return;
    }
    revealInspector.current = false;
    // `scrollIntoView` is absent under jsdom, so the call is guarded.
    inspectorRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth"
    });
  }, [activeShotId]);

  // The editor opens under the card, which on a tall card is partly below the
  // fold; bring it into view on open and whenever it moves to another shot.
  useEffect(() => {
    if (!editing) {
      return;
    }
    // `scrollIntoView` is absent under jsdom, so the call is guarded.
    editPanelRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth"
    });
  }, [editing]);

  // Clicking the selected card deselects it (the card's aria-pressed
  // contract); the store's selectShot stays idempotent for programmatic
  // callers.
  const handleSelectShot = useCallback(
    (shotId: string) => {
      const next = shotId === activeShotId ? null : shotId;
      revealInspector.current = next !== null;
      selectShot(boardId, next);
    },
    [selectShot, boardId, activeShotId]
  );
  const clearSelection = useCallback(
    () => selectShot(boardId, null),
    [selectShot, boardId]
  );
  const activeShotIndex = shots.findIndex((s) => s.id === activeShotId);
  const activeShot = activeShotIndex >= 0 ? shots[activeShotIndex] : undefined;

  // Arrow keys walk the selection along the grid and move focus with it;
  // Escape clears it. A card's fullscreen viewer is a portal whose key events
  // still bubble here in React, so only keys from the grid's own DOM count,
  // and none typed into a field.
  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        !gridRef.current?.contains(target) ||
        target.closest("input, textarea, [contenteditable=true]") ||
        // The editor is a row of this grid, so its keys arrive here too. It owns
        // them: Escape closes it, and nothing in it should move the selection.
        target.closest(".shot-edit-panel")
      ) {
        return;
      }
      if (event.key === "Escape") {
        if (activeShotId) {
          event.preventDefault();
          selectShot(boardId, null);
        }
        return;
      }
      if (!isShotNavigationKey(event.key)) {
        return;
      }
      const next = navigateShots(
        shots.map((s) => s.id),
        activeShotId,
        event.key
      );
      if (!next) {
        return;
      }
      event.preventDefault();
      if (next !== activeShotId) {
        revealInspector.current = true;
        selectShot(boardId, next);
      }
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-shot-id="${next}"]`)
        ?.focus();
    },
    [shots, activeShotId, selectShot, boardId]
  );

  // Drag one card onto another: the dragged shot takes the target's slot.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const handleDragStart = useCallback((shotId: string) => {
    setDraggingId(shotId);
  }, []);
  const handleDragEnter = useCallback(
    (shotId: string) => {
      setDropTargetId(shotId === draggingId ? null : shotId);
    },
    [draggingId]
  );
  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);
  // A drop can cross a scene header, so it names a scene and a position in it
  // rather than rewriting a flat list (PRD § 7.7.3). The store reindexes.
  const handleDrop = useCallback(
    (targetId: string) => {
      const drop = draggingId
        ? sceneDropTarget(sceneGroups, draggingId, targetId)
        : null;
      if (draggingId && drop) {
        moveShot(boardId, draggingId, drop.sceneId, drop.position);
      }
      setDraggingId(null);
      setDropTargetId(null);
    },
    [draggingId, moveShot, boardId, sceneGroups]
  );

  // A shot added by hand opens in the inspector, blank, ready to describe.
  const handleAddShot = useCallback(() => {
    revealInspector.current = true;
    addShot(boardId);
  }, [addShot, boardId]);

  // The `+` between two cards: the new shot joins the scene of the card it
  // follows, and the store reindexes the board around it.
  const handleInsertShot = useCallback(
    (afterShotId: string) => {
      revealInspector.current = true;
      insertShot(boardId, afterShotId);
    },
    [insertShot, boardId]
  );

  const runDirect = useCallback(() => {
    onDirect?.(shotCount);
  }, [onDirect, shotCount]);

  // Directing rewrites the whole screenplay, replacing every existing shot
  // (and its generated stills and clips). Confirm before clobbering work.
  const handleDirect = useCallback(() => {
    if (hasShots) {
      setConfirmRedirect(true);
      return;
    }
    runDirect();
  }, [hasShots, runDirect]);

  const handleConfirmRedirect = useCallback(() => {
    setConfirmRedirect(false);
    runDirect();
  }, [runDirect]);

  const hasRenderedShot = useMemo(
    () => shots.some((s) => s.status === "rendered" && !!s.clip?.asset_id),
    [shots]
  );

  // The preview plays clips and falls back to held keyframe stills, so any
  // shot carrying either asset is enough to have something to watch.
  const hasPlayableShot = useMemo(
    () => shots.some((s) => !!s.clip?.asset_id || !!s.keyframe?.asset_id),
    [shots]
  );

  const pendingStills = useMemo(
    () =>
      shots.filter(
        (s) =>
          shotRenderMode(s) === "keyframe" &&
          !s.keyframe &&
          (s.status === "planned" || s.status === "failed")
      ),
    [shots]
  );

  const hasIncompleteStills = shots.some(
    (s) => shotRenderMode(s) === "keyframe" && !s.keyframe
  );

  const pendingClips = useMemo(
    () =>
      shots.filter(
        (s) =>
          (!!s.keyframe ||
            shotRenderMode(s) === "direct" ||
            shotRenderMode(s) === "reference") &&
          !s.clip &&
          s.status !== "keyframe_generating" &&
          s.status !== "clip_generating"
      ),
    [shots]
  );

  const nextRenderStep = hasIncompleteStills
    ? pendingStills.length > 0
      ? "stills"
      : null
    : pendingClips.length > 0
      ? "clips"
      : null;
  const stillStepActive = nextRenderStep === "stills";
  const clipStepActive = nextRenderStep === "clips";
  const clipModelTasks = requiredVideoTasksForShots(pendingClips);
  const settingsVisible = settingsOpen;

  // The toolbar's one-line summary: how big the board is, how it looks, and
  // who is in it — the fields the folded form would otherwise hide.
  const { data: allEntities } = useEntities();
  // Every card's stale marker compares against the same board values the
  // enqueue path stamped a version with, so it is derived once here rather
  // than per card (PRD § 7.7.4). Built from what `useBoard` already returned,
  // not a second read of the store.
  const renderContext = useCallback(
    (shot: Shot) =>
      boardRenderContext(
        { aspectRatio, style, entityIds, imageModel, videoModel, screenplay },
        allEntities ?? [],
        shot
      ),
    [
      aspectRatio,
      style,
      entityIds,
      imageModel,
      videoModel,
      screenplay,
      allEntities
    ]
  );
  const summary = useMemo(() => {
    const entityNames = (allEntities ?? [])
      .filter((e) => entityIds.includes(e.id))
      .map((e) => e.name)
      .filter((name): name is string => !!name);
    return [
      `${shots.length} shot${shots.length === 1 ? "" : "s"}`,
      style.trim().length > 0 ? `${style.trim()} style` : null,
      entityNames.length > 0 ? `entity: ${entityNames.join(", ")}` : null
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }, [shots.length, style, entityIds, allEntities]);

  const { generateKeyframe, generateClip } = useGenerateShot();
  const resolveImageModel = useCallback(
    (value: ShotModelRef | null | undefined): ImageModelValue | null => {
      if (!value) {
        return null;
      }
      const model = imageModels.find(
        (candidate) =>
          candidate.id === value.id && candidate.provider === value.provider
      );
      return model ? imageValue(model) : null;
    },
    [imageModels]
  );
  const findRememberedImageModel = useCallback((): ImageModelValue | null => {
    const remembered = getRememberedModel("image");
    if (!remembered?.model || !remembered.provider) {
      return null;
    }
    return resolveImageModel({
      id: remembered.model,
      provider: remembered.provider
    });
  }, [resolveImageModel]);

  const resolveVideoModel = useCallback(
    (
      value: ShotModelRef | null | undefined,
      task: VideoModelTask
    ): VideoModelValue | null => {
      if (!value) {
        return null;
      }
      const model = videoModels.find(
        (candidate) =>
          candidate.id === value.id &&
          candidate.provider === value.provider &&
          modelMatchesTask(candidate.supported_tasks, task)
      );
      return model ? videoValue(model) : null;
    },
    [videoModels]
  );

  const findRememberedVideoModel = useCallback(
    (task: VideoModelTask): VideoModelValue | null => {
      const remembered =
        getRememberedModelForTask("video", task) ?? getRememberedModel("video");
      if (!remembered?.model || !remembered.provider) {
        return null;
      }
      return resolveVideoModel(
        { id: remembered.model, provider: remembered.provider },
        task
      );
    },
    [resolveVideoModel]
  );

  const defaultStillSelection = useMemo(
    () =>
      findRememberedImageModel() ??
      [...shots]
        .reverse()
        .map((shot) => resolveImageModel(shot.still_model))
        .find((model): model is ImageModelValue => model !== null) ??
      resolveImageModel(imageModel),
    [findRememberedImageModel, shots, resolveImageModel, imageModel]
  );

  const defaultClipSelections = useMemo(() => {
    const selections: Partial<Record<VideoModelTask, VideoModelValue>> = {};
    for (const task of clipModelTasks) {
      const shotModel = [...shots]
        .reverse()
        .filter((shot) => clipTaskForShot(shot) === task)
        .map((shot) => resolveVideoModel(shot.clip_model, task))
        .find((model): model is VideoModelValue => model !== null);
      const selected =
        findRememberedVideoModel(task) ??
        shotModel ??
        resolveVideoModel(videoModel, task);
      if (selected) {
        selections[task] = selected;
      }
    }
    return selections;
  }, [
    clipModelTasks,
    shots,
    findRememberedVideoModel,
    resolveVideoModel,
    videoModel
  ]);

  const openStillRenderDialog = useCallback(() => {
    setStillSelection(defaultStillSelection);
    setRenderDialog("stills");
  }, [defaultStillSelection]);

  const openClipRenderDialog = useCallback(() => {
    setClipSelections(defaultClipSelections);
    setRenderDialog("clips");
  }, [defaultClipSelections]);

  // A shot that cannot start records the reason on itself (its card shows it,
  // and it is toasted), so one failure must not stop the rest of the batch.
  const handleGenerateAllStills = useCallback(() => {
    if (!stillSelection) {
      return;
    }
    setImageModel(boardId, stillSelection);
    setRenderDialog(null);
    for (const shot of pendingStills) {
      void generateKeyframe(boardId, shot, stillSelection).catch(
        () => undefined
      );
    }
  }, [pendingStills, generateKeyframe, boardId, stillSelection, setImageModel]);
  const handleGenerateAllClips = useCallback(() => {
    if (clipModelTasks.some((task) => !clipSelections[task])) {
      return;
    }
    const lastModel = clipSelections[clipModelTasks.at(-1) as VideoModelTask];
    if (lastModel) {
      setVideoModel(boardId, lastModel);
    }
    setRenderDialog(null);
    for (const shot of pendingClips) {
      const model = clipSelections[clipTaskForShot(shot)];
      void generateClip(boardId, shot, model).catch(() => undefined);
    }
  }, [
    pendingClips,
    generateClip,
    boardId,
    clipModelTasks,
    clipSelections,
    setVideoModel
  ]);

  // What each batch button is about to spend, over exactly the shots it loops.
  const effectiveStillSelection =
    renderDialog === "stills" ? stillSelection : defaultStillSelection;
  const stillModelForShot = useCallback(
    () => effectiveStillSelection,
    [effectiveStillSelection]
  );
  const effectiveClipSelections =
    renderDialog === "clips" ? clipSelections : defaultClipSelections;
  const clipModelForShot = useCallback(
    (shot: Shot) => effectiveClipSelections[clipTaskForShot(shot)] ?? null,
    [effectiveClipSelections]
  );
  const stillsCost = useRenderBatchCostEstimate(
    boardId,
    pendingStills,
    "still",
    stillModelForShot
  );
  const clipsCost = useRenderBatchCostEstimate(
    boardId,
    pendingClips,
    "clip",
    clipModelForShot
  );

  // The archive is packed server-side from the saved board, so a download
  // shows what the server holds — the local edits an in-flight save has not
  // reached it with yet are not in the zip.
  const handleDownloadZip = useCallback(() => {
    setDownloading(true);
    exportStoryboardZip(boardId, title || "storyboard")
      .catch((error: unknown) => {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          dismissable: true,
          content: `Storyboard download failed. ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      })
      .finally(() => setDownloading(false));
  }, [boardId, title]);

  return (
    <ScrollArea
      fullHeight
      thin
      className="storyboard-board"
      data-focus-id="storyboard-board"
    >
      <FlexColumn
        gap={SPACING.lg}
        sx={{
          p: SPACING.xl,
          "@media (max-width: 600px)": {
            p: SPACING.md,
            gap: SPACING.md
          }
        }}
      >
        <FlexRow align="center" gap={SPACING.lg} wrap>
          <Text size="big">{title || "Untitled film"}</Text>
          <BoardGenreChip boardId={boardId} genre={genre} readOnly={readOnly} />
          <BoardLineageChip boardId={boardId} />
          <Caption color="secondary">{summary}</Caption>
          <Box sx={{ flex: 1 }} />
          {!readOnly && (
            <FlexRow align="center" gap={SPACING.md} wrap>
              <UndoRedoButtons
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                undoTooltip="Undo (⌘Z)"
                redoTooltip="Redo (⌘⇧Z)"
              />
              <EditorButton
                variant="outlined"
                startIcon={<AddIcon fontSize="small" />}
                onClick={handleAddShot}
                disabled={directing}
              >
                Add shot
              </EditorButton>
              <EditorButton
                variant="outlined"
                onClick={togglePreview}
                disabled={!hasPlayableShot}
              >
                {previewOpen ? "Hide preview" : "Preview"}
              </EditorButton>
              <EditorButton
                variant="outlined"
                onClick={handleDownloadZip}
                disabled={!hasShots || downloading}
              >
                {downloading ? "Preparing…" : "Download ZIP"}
              </EditorButton>
              <EditorButton variant="outlined" onClick={openStyle}>
                Change Style
              </EditorButton>
              <EditorButton
                variant={settingsVisible ? "contained" : "outlined"}
                startIcon={<TuneIcon fontSize="small" />}
                onClick={toggleSettings}
                aria-expanded={settingsVisible}
                aria-controls={settingsPanelId}
              >
                Board settings
              </EditorButton>
              <RenderBatchButton
                label="Render stills"
                estimate={stillsCost}
                disabled={pendingStills.length === 0 || !!directing}
                highlighted={stillStepActive}
                onClick={openStillRenderDialog}
              />
              <RenderBatchButton
                label="Render clips"
                estimate={clipsCost}
                disabled={pendingClips.length === 0 || !!directing}
                highlighted={clipStepActive}
                onClick={openClipRenderDialog}
              />
            </FlexRow>
          )}
        </FlexRow>

        {/* The board's own state, under the toolbar and above the settings
            form: what is stale and what failed. Both render null when they
            have nothing to say, so neither reserves space (PRD § 7.4). */}
        {!readOnly && (
          <FlexColumn gap={SPACING.md}>
            <BoardStaleBanner boardId={boardId} disabled={!!directing} />
            <BoardRetryFailed boardId={boardId} disabled={!!directing} />
          </FlexColumn>
        )}

        {!readOnly && (
          <Collapse in={settingsVisible} timeout="auto" unmountOnExit>
            <Panel
              id={settingsPanelId}
              padding={SPACING.xl}
              sx={{ maxWidth: "1100px" }}
            >
              <FlexColumn gap={SPACING.xl}>
                <SectionHeader
                  title="Board settings"
                  size="small"
                  action={
                    <CloseButton
                      tooltip="Close board settings"
                      onClick={closeSettings}
                    />
                  }
                />
                <FormGrid stackBelow={FORM_STACK_BELOW}>
                  <FormSection label="Screenplay">
                    <FormField label="Title">
                      <TextInput
                        value={title}
                        placeholder="Untitled film"
                        onChange={(e) => setTitle(boardId, e.target.value)}
                      />
                    </FormField>
                    <FormField label="Brief">
                      <TextInput
                        value={brief}
                        placeholder="Your film in one or two sentences"
                        onChange={(e) => setBrief(boardId, e.target.value)}
                        multiline
                        rows={3}
                      />
                    </FormField>
                    <FormField label="Style">
                      <TextInput
                        value={style}
                        placeholder="Palette, light, lens, texture"
                        onChange={(e) => setStyle(boardId, e.target.value)}
                      />
                    </FormField>
                    <FormField label="Entities">
                      <StoryboardEntitiesField
                        boardId={boardId}
                        entityIds={entityIds}
                      />
                    </FormField>
                  </FormSection>

                  <FormSection label="Direction" sx={settingsRailSx}>
                    {/* The Studio shell pins the director model — a beginner
                        picks what the film looks like, not which LLM writes it. */}
                    {!inStudio && (
                      <FormField label="Screenplay model" sx={modelFieldSx}>
                        <LanguageModelSelect
                          value={directorModel?.id ?? ""}
                          onChange={(value) => setDirectorModel(boardId, value)}
                        />
                      </FormField>
                    )}
                    <FormField label="Aspect ratio">
                      <SelectField
                        label="Aspect ratio"
                        value={aspectRatio}
                        onChange={(value) => setAspectRatio(boardId, value)}
                        options={ASPECT_OPTIONS}
                      />
                    </FormField>
                    <FormField label="Shots">
                      <SelectField
                        label="Shots"
                        value={shotCount}
                        onChange={(value) => setShotCount(Number(value))}
                        options={SHOT_COUNT_OPTIONS}
                      />
                    </FormField>
                  </FormSection>
                </FormGrid>

                <Divider />

                <FlexRow
                  gap={SPACING.md}
                  align="center"
                  justify="space-between"
                  wrap
                >
                  <Caption
                    color={directError || assembleError ? "error" : "secondary"}
                  >
                    {directError ??
                      assembleError ??
                      (hasShots
                        ? "Re-directing rewrites the screenplay and replaces every shot."
                        : "Direct writes the screenplay and seeds your shots.")}
                  </Caption>
                  <EditorButton
                    variant="contained"
                    color="primary"
                    onClick={handleDirect}
                    disabled={!onDirect || directing}
                  >
                    {directing
                      ? "Directing…"
                      : hasShots
                        ? "Re-direct"
                        : "Direct"}
                  </EditorButton>
                </FlexRow>
              </FlexColumn>
            </Panel>
          </Collapse>
        )}

        <Dialog
          open={renderDialog === "stills"}
          onClose={() => setRenderDialog(null)}
          title="Render stills"
          onConfirm={handleGenerateAllStills}
          confirmText={`Render stills${
            stillsCost.pricedCount > 0 && stillsCost.cost > 0
              ? ` · ~${formatUsd(stillsCost.cost)}`
              : ""
          }`}
          confirmDisabled={!stillSelection}
        >
          <FlexColumn gap={SPACING.md}>
            <Caption color="secondary">
              Pick the model for this batch. The choice is remembered on every
              shot for one-click regeneration.
            </Caption>
            <FormField label="Still model" sx={modelFieldSx}>
              <ImageModelSelect
                value={stillSelection?.id ?? ""}
                task={STILL_MODEL_TASKS}
                onChange={setStillSelection}
              />
              {entityIds.length > 0 && (
                <EntityStillModelWarning modelId={stillSelection?.id} />
              )}
            </FormField>
            <RenderCostSummary estimate={stillsCost} />
          </FlexColumn>
        </Dialog>

        <Dialog
          open={renderDialog === "clips"}
          onClose={() => setRenderDialog(null)}
          title="Render clips"
          onConfirm={handleGenerateAllClips}
          confirmText={`Render clips${
            clipsCost.pricedCount > 0 && clipsCost.cost > 0
              ? ` · ~${formatUsd(clipsCost.cost)}`
              : ""
          }`}
          confirmDisabled={clipModelTasks.some((task) => !clipSelections[task])}
        >
          <FlexColumn gap={SPACING.md}>
            <Caption color="secondary">
              Pick a model for each kind of clip in this batch. Each shot keeps
              its choice for fast re-renders.
            </Caption>
            {clipModelTasks.map((task) => (
              <FormField
                key={task}
                label={CLIP_TASK_LABELS[task]}
                sx={modelFieldSx}
              >
                <VideoModelSelect
                  value={clipSelections[task]?.id ?? ""}
                  task={task}
                  onChange={(value) =>
                    setClipSelections((current) => ({
                      ...current,
                      [task]: value
                    }))
                  }
                />
              </FormField>
            ))}
            <RenderCostSummary estimate={clipsCost} />
          </FlexColumn>
        </Dialog>

        <Dialog
          open={confirmRedirect}
          onClose={() => setConfirmRedirect(false)}
          title="Re-direct this storyboard?"
          onConfirm={handleConfirmRedirect}
          confirmText="Re-direct"
          destructive
        >
          <FlexColumn gap={SPACING.xs}>
            <Text>
              {`Directing writes a new screenplay and replaces all ${shots.length} current shot${shots.length === 1 ? "" : "s"}.`}
            </Text>
            <Caption color="secondary">
              Generated stills and clips stay in your asset library, but the
              shots on this board are rebuilt from scratch.
            </Caption>
          </FlexColumn>
        </Dialog>

        {previewOpen && (
          <React.Suspense
            fallback={<LoadingSpinner size="small" text="Loading preview" />}
          >
            <LazyStoryboardPreview boardId={boardId} />
          </React.Suspense>
        )}

        {directing ? (
          <FlexColumn gap={SPACING.md}>
            <Caption color="primary">
              The director is writing your screenplay.
            </Caption>
            <Box sx={shotGridSx}>
              {Array.from({ length: shotCount }).map((_, i) => (
                <Card key={i} variant="outlined" padding="none">
                  <Skeleton
                    variant="rectangular"
                    animation="wave"
                    sx={{
                      width: "100%",
                      aspectRatio: "16 / 9",
                      height: "auto",
                      borderRadius: BORDER_RADIUS.lg
                    }}
                  />
                </Card>
              ))}
            </Box>
          </FlexColumn>
        ) : shots.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No shots yet"
            description={
              readOnly
                ? "This storyboard has no shots."
                : "Write a brief and press Direct to generate a screenplay of shots."
            }
          />
        ) : (
          <Box
            ref={gridRef}
            role="group"
            aria-label="Shots"
            onKeyDown={handleGridKeyDown}
            sx={shotGridSx}
          >
            {sceneGroups.map((group, sceneIndex) => (
              // A legacy board has one group with no scene record; it gets the
              // implicit header, and no `Scene` is written to get it.
              <React.Fragment key={group.sceneId ?? "unscened"}>
                <SceneHeader
                  number={sceneIndex + 1}
                  slugline={group.scene?.slugline || undefined}
                />
                {group.shots.map((shot) => (
                  <React.Fragment key={shot.id}>
                    <Box sx={shotSlotSx}>
                      <ShotCard
                        boardId={boardId}
                        shot={shot}
                        caption={captions.get(shot.id)}
                        renderContext={renderContext}
                        selected={shot.id === activeShotId}
                        onSelect={handleSelectShot}
                        readOnly={readOnly}
                        draggable={!readOnly && !directing}
                        dropTarget={shot.id === dropTargetId}
                        onDragStart={handleDragStart}
                        onDragEnter={handleDragEnter}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDrop}
                        onEdit={readOnly ? undefined : handleEditShot}
                      />
                      {!readOnly && !directing && (
                        <ShotInsertPoint
                          afterShotId={shot.id}
                          label={`after ${captions.get(shot.id) ?? ""}`}
                          onInsert={handleInsertShot}
                        />
                      )}
                    </Box>
                    {/* Directly under the card: a full-width row of this same
                        grid, so the shot stays on screen while it is edited. */}
                    {editing?.shotId === shot.id && (
                      <Box ref={editPanelRef} sx={editRowSx}>
                        <ShotEditPanel
                          boardId={boardId}
                          shotId={shot.id}
                          focusDialogue={editing.focus === "dialogue"}
                          readOnly={readOnly}
                          onClose={closeEditing}
                          onShotChange={handleEditingShotChange}
                          onOpenBoardSettings={openSettings}
                        />
                      </Box>
                    )}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </Box>
        )}

        {/* What comes after the board (PRD § 7.4). Both actions already exist
            — the script link control and the timeline handoff — and are shown
            here rather than in the spend toolbar, because neither renders. */}
        {!readOnly && (
          <FlexRow align="flex-start" gap={SPACING.md} wrap>
            <ScriptLinkControl boardId={boardId} disabled={directing} />
            <EditorButton
              variant="contained"
              color="primary"
              onClick={onAssemble}
              disabled={!onAssemble || assembling || !hasRenderedShot}
            >
              {assembling ? "Assembling…" : "Assemble timeline"}
            </EditorButton>
          </FlexRow>
        )}

        <BoardStyleDialog
          boardId={boardId}
          open={styleOpen}
          onClose={closeStyle}
        />

        {activeShot && (
          <Box ref={inspectorRef}>
            <ShotInspector
              key={activeShot.id}
              boardId={boardId}
              shot={activeShot}
              readOnly={readOnly}
              onClose={clearSelection}
              onEdit={readOnly ? undefined : handleEditShotFields}
            />
          </Box>
        )}
      </FlexColumn>
    </ScrollArea>
  );
};

export const StoryboardBoard = memo(StoryboardBoardInner);
StoryboardBoard.displayName = "StoryboardBoard";

export default StoryboardBoard;
