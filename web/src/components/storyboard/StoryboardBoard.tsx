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
 * `Edit` on a card opens {@link ShotEditPanel} in an overlay that covers the
 * board. The board stays mounted underneath, inert, so closing the editor
 * returns to the same scroll position.
 */

import React, {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import {
  shotRenderMode,
  requiredVideoTasksForShots
} from "@nodetool-ai/protocol";
import { effectiveShotDuration } from "@nodetool-ai/timeline";
import type {
  SceneClipDirection,
  Shot,
  ShotModelRef
} from "@nodetool-ai/protocol";
import AddIcon from "@mui/icons-material/AddOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SlideshowIcon from "@mui/icons-material/Slideshow";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { ASPECT_OPTIONS } from "./aspectOptions";
import {
  CLIP_TASK_LABELS,
  STILL_MODEL_TASKS,
  clipTaskForShot,
  imageValue,
  modelFieldSx,
  videoValue
} from "./shotRenderModels";
import RenderCostSummary from "./RenderCostSummary";

import ErrorBanner from "../support/ErrorBanner";
import {
  AlertBanner,
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
  SearchInput,
  SectionHeader,
  SelectField,
  Skeleton,
  Text,
  TextArea,
  TextInput,
  ToolbarIconButton,
  Tooltip,
  UndoRedoButtons,
  BORDER_RADIUS,
  SPACING,
  Z_INDEX
} from "../ui_primitives";
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
import { flushStoryboardSave } from "../../hooks/storyboard/storyboardSaveRegistry";
import { useTimeline } from "../../hooks/useTimelineSequence";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  useRenderBatchCostEstimate,
  type RenderBatchCostEstimate
} from "../../hooks/storyboard/useRenderBatchCostEstimate";
import { useBoardScriptLines } from "../../hooks/storyboard/useShotDuration";
import { sceneOrder, type SceneGroup } from "../../lib/storyboard/sceneOrder";
import BoardGenreChip from "./BoardGenreChip";
import BoardLineageChip from "./BoardLineageChip";
import BoardRetryFailed from "./BoardRetryFailed";
import BoardStaleBanner from "./BoardStaleBanner";
import BoardStyleDialog from "./BoardStyleDialog";
import EntityStillModelWarning from "./EntityStillModelWarning";
import SceneHeader from "./SceneHeader";
import SceneClipControls from "./SceneClipControls";
import {
  newSceneClipShotIds,
  sceneClipParts,
  sceneClipsInGroup
} from "./sceneClips";
import ScriptLinkControl from "./ScriptLinkControl";
import ShotCard from "./ShotCard";
import { shotWorkflowMedia } from "./shotWorkflowMedia";
import BoardActionsMenu from "./BoardActionsMenu";
import BoardCardSizeSlider from "./BoardCardSizeSlider";
import StoryboardSlideshow from "./StoryboardSlideshow";
import { useStoryboardViewStore } from "../../stores/storyboard/StoryboardViewStore";
import ShotEditPanel from "./ShotEditPanel";
import OneTakePanel from "./OneTakePanel";
const SceneClipDialog = React.lazy(() => import("./SceneClipDialog"));
import ShotInsertPoint, { SHOT_INSERT_POINT_CLASS } from "./ShotInsertPoint";
import { searchSceneGroups } from "./shotSearch";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import ShotInspector from "./ShotInspector";
import StoryboardEntitiesField from "./StoryboardEntitiesField";
import { sceneDropTarget } from "./sceneDrop";
import { isShotNavigationKey, navigateShots } from "./shotOrder";
import { isAssemblableShot } from "./assembleTimeline";
import {
  getRememberedModel,
  getRememberedModelForTask
} from "../../stores/lastModelStore";
import { countOwnedClips } from "../../lib/assembledSequenceMerge";

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
  /**
   * Opens the linked timeline. Absent: the board opens it as a workspace tab.
   */
  onOpenTimeline?: (timelineId: string) => void;
  /** True while assembly is in flight. */
  assembling?: boolean;
  /** Error from the last assembly, shown under the header fields. */
  assembleError?: string | null;
  /** Queue request whose unaccepted take should be opened in the shot editor. */
  reviewRequest?: StoryboardReviewRequest | null;
  /** Whether the parent shows the board assistant beside the board. */
  assistantOpen?: boolean;
  /** Shows or hides the assistant. The toolbar offers no toggle without it. */
  onToggleAssistant?: () => void;
}

export interface StoryboardReviewRequest {
  shotId: string;
  requestId: string;
}

const SHOT_COUNT_OPTIONS = [3, 4, 5, 6, 8, 10, 12];

const FORM_STACK_BELOW = 860;

const settingsRailSx = {
  [`@media (min-width: ${FORM_STACK_BELOW + 1}px)`]: {
    paddingLeft: SPACING.xl,
    borderLeft: "1px solid",
    borderColor: "divider"
  }
} as const;

/**
 * Let cards follow the width of their scene, including narrow split views.
 * `cardSize` is the card's minimum width in `ch`, set by the toolbar's size
 * slider.
 */
const shotGridSx = (cardSize: number) =>
  ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cardSize}ch), 1fr))`,
    gap: SPACING.xl,
    alignItems: "start"
  }) as const;

/** The editor's overlay: the board's whole area, above the board. */
const editOverlaySx = {
  position: "absolute",
  inset: 0,
  zIndex: Z_INDEX.overlay,
  bgcolor: "background.default"
} as const;

/**
 * One card's cell. It hosts the trailing insert point, which is revealed by
 * hover or by a keyboard focus landing anywhere inside the cell.
 */
const NO_SCENE_CLIPS: readonly SceneClipDirection[] = [];

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
  groups: readonly SceneGroup[],
  translate: (key: string, options: { scene: string; shot: string }) => string,
  locale: string
): Map<string, string> => {
  const captions = new Map<string, string>();
  const number = new Intl.NumberFormat(locale);
  groups.forEach((group, sceneIndex) => {
    group.shots.forEach((shot, shotIndex) => {
      captions.set(
        shot.id,
        translate("screens4_20.storyboardBoard.sceneShotCaption", {
          scene: number.format(sceneIndex + 1),
          shot: number.format(shotIndex + 1)
        })
      );
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
  /** Shares a row with its sibling on a phone instead of sizing to its label. */
  fullWidth?: boolean;
}

const RenderBatchButton: React.FC<RenderBatchButtonProps> = ({
  label,
  estimate,
  disabled,
  highlighted,
  onClick,
  fullWidth
}) => {
  const { t, i18n } = useTranslation();
  const formatCost = (usd: number): string => {
    const fractionDigits = usd >= 0.01 ? 3 : usd > 0 ? Math.min(12, Math.ceil(-Math.log10(usd)) + 2) : 0;
    return new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: fractionDigits
    }).format(Number.isFinite(usd) ? usd : 0);
  };
  const { requestCount, cost, pricedRequestCount, reasons, notes } = estimate;
  const priced = pricedRequestCount > 0 && cost > 0;
  const partial = priced && pricedRequestCount < requestCount;

  return (
    <Tooltip
      placement="top"
      title={
        <FlexColumn gap={SPACING.micro}>
          <Text size="small">
            {priced
              ? t("screens4_20.storyboardBoard.requestCost", {
                  count: requestCount,
                  cost: formatCost(cost),
                  partial,
                  pricedCount: pricedRequestCount
                })
              : t("screens4_20.storyboardBoard.requestCountUnpriced", { count: requestCount })}
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
              {t("screens4_20.storyboardBoard.providerPricingNote")}
            </Caption>
          )}
        </FlexColumn>
      }
    >
      {/* A disabled button swallows pointer events, so the tooltip needs a host. */}
      <FlexRow
        component="span"
        sx={fullWidth ? { flex: 1, minWidth: 0 } : undefined}
      >
        <EditorButton
          variant={highlighted ? "contained" : "outlined"}
          color="primary"
          aria-current={highlighted ? "step" : undefined}
          onClick={onClick}
          disabled={disabled}
          fullWidth={fullWidth}
        >
          {`${label}${requestCount > 0 ? ` (${requestCount})` : ""}${
            priced ? ` · ~${formatCost(cost)}` : ""
          }`}
        </EditorButton>
      </FlexRow>
    </Tooltip>
  );
};

const StoryboardBoardInner: React.FC<StoryboardBoardProps> = ({
  boardId,
  readOnly,
  onDirect,
  directing,
  directError,
  onAssemble,
  onOpenTimeline,
  assembling,
  assembleError,
  reviewRequest,
  assistantOpen = false,
  onToggleAssistant
}) => {
  const { t, i18n } = useTranslation();
  const formatCost = (usd: number): string => {
    const fractionDigits = usd >= 0.01 ? 3 : usd > 0 ? Math.min(12, Math.ceil(-Math.log10(usd)) + 2) : 0;
    return new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: fractionDigits
    }).format(Number.isFinite(usd) ? usd : 0);
  };
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
    activeShotId,
    timelineId
  } = useBoard(boardId);

  // Land on the shot a script line or a cut clip linked to, once it has loaded.
  useStoryboardShotFocus(boardId);

  const inStudio = useInStudio();
  const theme = useTheme();
  const compactToolbar = useMediaQuery(theme.breakpoints.down("sm"));
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
  const cardSize = useStoryboardViewStore((state) => state.cardSize);
  // The shot the slideshow opens on: null opens it on the selection (or the
  // first shot); undefined keeps it closed.
  const [slideshowStart, setSlideshowStart] = useState<
    string | null | undefined
  >(undefined);
  const openSlideshow = useCallback(() => setSlideshowStart(null), []);
  const closeSlideshow = useCallback(() => setSlideshowStart(undefined), []);
  const [downloading, setDownloading] = useState(false);
  const [downloadFallbackError, setDownloadFallbackError] = useState<
    string | null
  >(null);
  const [assembleConfirmOpen, setAssembleConfirmOpen] = useState(false);
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
  // this rather than the card, because the overlay covers the whole board.
  const [editing, setEditing] = useState<{
    shotId: string;
    focus: "fields" | "dialogue";
  } | null>(null);
  const [leaveRequest, setLeaveRequest] = useState<{
    id: number;
    reason: "switch" | "download";
    shotId?: string;
    focus?: "fields" | "dialogue";
  } | null>(null);
  const nextLeaveRequestId = useRef(0);
  const handleEditShot = useCallback(
    (shotId: string, focus: "fields" | "dialogue" = "fields") => {
      if (editing && editing.shotId !== shotId) {
        nextLeaveRequestId.current += 1;
        setLeaveRequest({
          id: nextLeaveRequestId.current,
          reason: "switch",
          shotId,
          focus
        });
        return;
      }
      selectShot(boardId, shotId);
      setEditing({ shotId, focus });
    },
    [editing, selectShot, boardId]
  );
  const handleEditShotFields = useCallback(
    (shotId: string) => handleEditShot(shotId, "fields"),
    [handleEditShot]
  );
  // Keyed on the request object, not its id: asking to review the same take
  // twice (after closing the editor) is two requests.
  const handledReviewRequest = useRef<typeof reviewRequest>(null);
  useEffect(() => {
    if (
      readOnly ||
      !reviewRequest ||
      handledReviewRequest.current === reviewRequest
    ) {
      return;
    }
    handledReviewRequest.current = reviewRequest;
    handleEditShot(reviewRequest.shotId, "fields");
  }, [handleEditShot, readOnly, reviewRequest]);
  const closeEditing = useCallback(() => setEditing(null), []);
  // The edited shot can leave the board (deleted, undone, re-directed). With
  // no panel mounted, nothing would answer a leave request, and every other
  // Edit button and Download ZIP would wait on it.
  useEffect(() => {
    if (editing && !shots.some((s) => s.id === editing.shotId)) {
      setEditing(null);
      setLeaveRequest(null);
    }
  }, [editing, shots]);
  // Stepping from the panel moves it to the shot it steps to; the focus goes
  // back to the fields, since the dialogue cell was this shot's request.
  const handleEditingShotChange = useCallback(
    (shotId: string) => {
      selectShot(boardId, shotId);
      setEditing({ shotId, focus: "fields" });
    },
    [selectShot, boardId]
  );

  // The one grouping pass the render needs: the headers, the cards under each,
  // the captions, and the scene a drop resolves against all read it.
  const scenes = screenplay?.scenes;
  const sceneGroups = useMemo(() => sceneOrder(shots, scenes), [shots, scenes]);
  const captions = useMemo(
    () => captionsByShotId(sceneGroups, t, i18n.resolvedLanguage ?? i18n.language),
    [sceneGroups, t, i18n.resolvedLanguage, i18n.language]
  );
  // Each card shows the length its clip renders at: the takes of a linked
  // script when they time the shot, the shot's own seconds otherwise.
  const scriptLines = useBoardScriptLines(boardId);
  const durations = useMemo(() => {
    const seconds = new Map<string, number>();
    for (const shot of shots) {
      const duration = effectiveShotDuration(shot, scriptLines).seconds;
      if (duration != null && duration > 0) {
        seconds.set(shot.id, duration);
      }
    }
    return seconds;
  }, [shots, scriptLines]);
  // Quick search narrows the cards shown. Reordering and inserting act on the
  // full board, so both are off while a query hides shots.
  const [shotQuery, setShotQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = shotQuery.trim() !== "";
  const visibleGroups = useMemo(
    () => searchSceneGroups(sceneGroups, shotQuery, captions),
    [sceneGroups, shotQuery, captions]
  );
  const visibleShotIds = useMemo(
    () => visibleGroups.flatMap((group) => group.shots.map((shot) => shot.id)),
    [visibleGroups]
  );
  useGlobalCombo("/", () => searchRef.current?.focus(), {
    target: () => searchRef.current
  });
  const sceneClips =
    useStoryboardStore((state) => state.boards[boardId]?.sceneClips) ??
    NO_SCENE_CLIPS;
  const sceneClipTags = useMemo(() => {
    const tags = new Map<string, string>();
    for (const [shotId, part] of sceneClipParts(shots, sceneClips)) {
      tags.set(
        shotId,
        t("screens4_20.storyboardBoard.clipPartTag", {
          position: part.position,
          count: part.count,
          window: part.window
        })
      );
    }
    return tags;
  }, [shots, sceneClips, t]);
  const sceneClipsByGroup = useMemo(
    () =>
      new Map(
        sceneGroups.map((group) => [
          group.sceneId,
          sceneClipsInGroup(group.shots, sceneClips)
        ])
      ),
    [sceneGroups, sceneClips]
  );
  const [sceneClipDialog, setSceneClipDialog] = useState<{
    sceneShots: Shot[];
    clip: SceneClipDirection;
    saved: boolean;
  } | null>(null);
  const openSceneClip = useCallback(
    (sceneId: string | null, clip: SceneClipDirection | null) => {
      const group = sceneGroups.find((g) => g.sceneId === sceneId);
      if (!group) {
        return;
      }
      setSceneClipDialog(
        clip
          ? { sceneShots: group.shots, clip, saved: true }
          : {
              sceneShots: group.shots,
              clip: {
                id: crypto.randomUUID(),
                prompt: "",
                shot_ids: newSceneClipShotIds(
                  group.shots,
                  sceneClipsByGroup.get(sceneId) ?? NO_SCENE_CLIPS
                )
              },
              saved: false
            }
      );
    },
    [sceneGroups, sceneClipsByGroup]
  );
  const closeSceneClip = useCallback(() => setSceneClipDialog(null), []);

  const hasShots = shots.length > 0;
  const boardWorkflowMedia = useMemo(
    () => shots.flatMap(shotWorkflowMedia),
    [shots]
  );

  // A board with no shots is a board being set up: the form is the surface.
  // Once shots exist the grid is, and the form folds behind the toolbar.
  const [settingsOpen, setSettingsOpen] = useState(!hasShots);
  const toggleSettings = useCallback(
    () => setSettingsOpen((open) => !open),
    []
  );
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const settingsPanelId = `storyboard-board-settings-${boardId}`;
  const [oneTakeOpen, setOneTakeOpen] = useState(false);
  const toggleOneTake = useCallback(() => setOneTakeOpen((open) => !open), []);
  const closeOneTake = useCallback(() => setOneTakeOpen(false), []);
  const oneTakePanelId = `storyboard-one-take-${boardId}`;

  const gridRef = useRef<HTMLDivElement>(null);

  // Clicking a card selects it and presents the board from that shot.
  const handleSelectShot = useCallback(
    (shotId: string) => {
      selectShot(boardId, shotId);
      setSlideshowStart(shotId);
    },
    [selectShot, boardId]
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
        target.closest(
          "input, textarea, select, [contenteditable=true], [role=combobox], [role=listbox], [role=slider]"
        ) ||
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
      const next = navigateShots(visibleShotIds, activeShotId, event.key);
      if (!next) {
        return;
      }
      event.preventDefault();
      if (next !== activeShotId) {
        selectShot(boardId, next);
      }
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-shot-id="${next}"]`)
        ?.focus();
    },
    [visibleShotIds, activeShotId, selectShot, boardId]
  );

  // Enter in the search field opens the first match: it is selected and
  // focused, so the arrow keys continue from there.
  const handleSearchSubmit = useCallback(() => {
    const first = visibleShotIds[0];
    if (!first || !searching) {
      return;
    }
    selectShot(boardId, first);
    // Focus also scrolls the card into view.
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-shot-id="${first}"]`)
      ?.focus();
  }, [visibleShotIds, searching, selectShot, boardId]);

  // Drag one card onto another: the dragged shot takes the target's slot.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const handleDragStart = useCallback((shotId: string) => {
    setDraggingId(shotId);
  }, []);
  const handleDragEnter = useCallback(
    (shotId: string) => {
      if (!draggingId) {
        return;
      }
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
    addShot(boardId);
  }, [addShot, boardId]);

  // The `+` between two cards: the new shot joins the scene of the card it
  // follows, and the store reindexes the board around it.
  const handleInsertShot = useCallback(
    (afterShotId: string) => {
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

  const hasRenderedShot = useMemo(() => shots.some(isAssemblableShot), [shots]);
  const assemblableShotCount = shots.filter(isAssemblableShot).length;
  const skippedAssemblyCount = shots.length - assemblableShotCount;
  const hasUnselectedClip = shots.some(
    (shot) =>
      !shot.clip && shot.clip_versions?.some((version) => !!version.asset_id)
  );
  const linkedTimeline = useTimeline(timelineId);
  const replacedClipCount = linkedTimeline.data
    ? countOwnedClips(linkedTimeline.data.clips, {
        boardId,
        scriptId: screenplay?.script_id ?? null
      })
    : null;
  const handleAssembleClick = useCallback(() => {
    if (timelineId) {
      setAssembleConfirmOpen(true);
      return;
    }
    onAssemble?.();
  }, [timelineId, onAssemble]);
  const handleOpenTimeline = useCallback(() => {
    if (!timelineId) {
      return;
    }
    if (onOpenTimeline) {
      onOpenTimeline(timelineId);
      return;
    }
    useWorkspaceTabsStore.getState().openTab({
      type: "timeline",
      ref: timelineId,
      mode: "edit",
      title: linkedTimeline.data?.name,
      projectId: linkedTimeline.data?.projectId
    });
  }, [timelineId, onOpenTimeline, linkedTimeline.data]);
  const handleConfirmAssemble = useCallback(() => {
    setAssembleConfirmOpen(false);
    onAssemble?.();
  }, [onAssemble]);

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
          // A shot another shot's clip already covers has nothing to render.
          !s.covered_by &&
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
    const batchId = crypto.randomUUID();
    for (const shot of pendingStills) {
      void generateKeyframe(boardId, shot, stillSelection, batchId).catch(
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
    const batchId = crypto.randomUUID();
    for (const shot of pendingClips) {
      const model = clipSelections[clipTaskForShot(shot)];
      void generateClip(boardId, shot, model, batchId).catch(() => undefined);
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
  // The stills batch is half the spend: those shots need clips next. Priced
  // with each shot's remembered clip model, so the dialog can show the whole
  // job before the first half of it starts.
  const followUpClipsCost = useRenderBatchCostEstimate(
    boardId,
    pendingStills,
    "clip"
  );

  const downloadZip = useCallback(
    async (flush: boolean) => {
      setDownloading(true);
      try {
        if (flush) {
          const saved = await flushStoryboardSave(boardId);
          if (!saved.ok) {
            setDownloadFallbackError(saved.error);
            return;
          }
        }
        await exportStoryboardZip(boardId, title || "storyboard");
      } catch (error) {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          dismissable: true,
          content: t("screens4_20.storyboardBoard.downloadFailed", {
            error: error instanceof Error ? error.message : String(error)
          })
        });
      } finally {
        setDownloading(false);
      }
    },
    [boardId, title, t]
  );

  const handleDownloadZip = useCallback(() => {
    if (editing) {
      nextLeaveRequestId.current += 1;
      setLeaveRequest({
        id: nextLeaveRequestId.current,
        reason: "download"
      });
      return;
    }
    void downloadZip(true);
  }, [editing, downloadZip]);

  const handleLeaveRequestComplete = useCallback(
    (result: "saved" | "discarded" | "cancelled") => {
      const request = leaveRequest;
      setLeaveRequest(null);
      if (!request || result === "cancelled") {
        return;
      }
      if (request.reason === "switch" && request.shotId) {
        selectShot(boardId, request.shotId);
        setEditing({
          shotId: request.shotId,
          focus: request.focus ?? "fields"
        });
        return;
      }
      if (request.reason === "download") {
        void downloadZip(true);
      }
    },
    [leaveRequest, selectShot, boardId, downloadZip]
  );

  const undoRedo = (
    <UndoRedoButtons
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={onUndo}
      onRedo={onRedo}
      undoTooltip={t("screens4_20.storyboardBoard.undoTooltip")}
      redoTooltip={t("screens4_20.storyboardBoard.redoTooltip")}
    />
  );
  const downloadingStatus = downloading && (
    <FlexRow align="center" gap={SPACING.xs} role="status">
      <LoadingSpinner inline size={16} />
      <Caption color="secondary">{t("screens4_20.storyboardBoard.preparingZip")}</Caption>
    </FlexRow>
  );
  const actionsMenu = (
    <BoardActionsMenu
      onChangeStyle={openStyle}
      onDownloadZip={handleDownloadZip}
      downloading={downloading}
      hasShots={hasShots}
      workflowMedia={boardWorkflowMedia}
    />
  );
  const renderStillsButton = (
    <RenderBatchButton
      label={t("screens4_20.storyboardBoard.renderStills")}
      estimate={stillsCost}
      disabled={pendingStills.length === 0 || !!directing}
      highlighted={stillStepActive}
      onClick={openStillRenderDialog}
      fullWidth={compactToolbar}
    />
  );
  const renderClipsButton = (
    <RenderBatchButton
      label={t("screens4_20.storyboardBoard.renderClips")}
      estimate={clipsCost}
      disabled={pendingClips.length === 0 || !!directing}
      highlighted={clipStepActive}
      onClick={openClipRenderDialog}
      fullWidth={compactToolbar}
    />
  );

  return (
    <Box sx={{ position: "relative", height: "100%", minHeight: 0 }}>
      <ScrollArea
        fullHeight
        thin
        className="storyboard-board"
        data-focus-id="storyboard-board"
        inert={editing ? true : undefined}
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
            <Text size="big">{title || t("screens4_20.storyboardBoard.untitledFilm")}</Text>
            <BoardGenreChip
              boardId={boardId}
              genre={genre}
              readOnly={readOnly}
            />
            <BoardLineageChip boardId={boardId} />
            <Caption color="secondary">{summary}</Caption>
            {!compactToolbar && (
              <>
                <Box sx={{ flex: 1 }} />
                {hasShots && (
                  <FlexRow align="center" gap={SPACING.md}>
                    <BoardCardSizeSlider />
                    <EditorButton variant="outlined" onClick={openSlideshow}>
                      {t("screens4_20.storyboardBoard.slideshow")}
                    </EditorButton>
                  </FlexRow>
                )}
                {!readOnly && (
                  <FlexRow align="center" gap={SPACING.md} wrap>
                    {undoRedo}
                    <EditorButton
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleAddShot}
                      disabled={directing}
                    >
                      {t("screens4_20.storyboardBoard.addShot")}
                    </EditorButton>
                    <EditorButton
                      variant="outlined"
                      onClick={togglePreview}
                      disabled={!hasPlayableShot}
                    >
                      {previewOpen ? t("screens4_20.storyboardBoard.hidePreview") : t("screens4_20.storyboardBoard.preview")}
                    </EditorButton>
                    <EditorButton
                      variant={settingsVisible ? "contained" : "outlined"}
                      startIcon={<TuneIcon />}
                      onClick={toggleSettings}
                      aria-expanded={settingsVisible}
                      aria-controls={settingsPanelId}
                    >
                      {t("screens4_20.storyboardBoard.boardSettings")}
                    </EditorButton>
                    <EditorButton
                      variant={oneTakeOpen ? "contained" : "outlined"}
                      startIcon={<MovieOutlinedIcon />}
                      onClick={toggleOneTake}
                      aria-expanded={oneTakeOpen}
                      aria-controls={oneTakePanelId}
                    >
                      {t("screens4_20.storyboardBoard.oneTake")}
                    </EditorButton>
                    {onToggleAssistant && (
                      <EditorButton
                        variant={assistantOpen ? "contained" : "outlined"}
                        startIcon={<AutoAwesomeIcon />}
                        onClick={onToggleAssistant}
                        aria-pressed={assistantOpen}
                      >
                        {t("screens4_20.storyboardBoard.assistant")}
                      </EditorButton>
                    )}
                    {downloadingStatus}
                    {actionsMenu}
                    {renderStillsButton}
                    {renderClipsButton}
                  </FlexRow>
                )}
              </>
            )}
          </FlexRow>

          {/* A phone has no room for a row of labelled buttons: the board's
              tools become one row of icons, and the two render buttons, which
              spend money, keep their labels and share the row under it. The
              card size slider is left out, since one column fills the width
              at any size. */}
          {compactToolbar && (hasShots || !readOnly) && (
            <FlexColumn gap={SPACING.sm}>
              <FlexRow align="center" gap={SPACING.xs} wrap>
                {!readOnly && undoRedo}
                {!readOnly && (
                  <ToolbarIconButton
                    icon={<AddIcon />}
                    tooltip={t("screens4_20.storyboardBoard.addShot")}
                    onClick={handleAddShot}
                    disabled={directing}
                  />
                )}
                {hasShots && (
                  <ToolbarIconButton
                    icon={<SlideshowIcon />}
                    tooltip={t("screens4_20.storyboardBoard.slideshow")}
                    onClick={openSlideshow}
                  />
                )}
                {!readOnly && (
                  <ToolbarIconButton
                    icon={<PlayCircleOutlineIcon />}
                    tooltip={previewOpen ? t("screens4_20.storyboardBoard.hidePreview") : t("screens4_20.storyboardBoard.preview")}
                    onClick={togglePreview}
                    disabled={!hasPlayableShot}
                    active={previewOpen}
                    aria-pressed={previewOpen}
                  />
                )}
                {!readOnly && (
                  <ToolbarIconButton
                    icon={<TuneIcon />}
                    tooltip={t("screens4_20.storyboardBoard.boardSettings")}
                    onClick={toggleSettings}
                    active={settingsVisible}
                    aria-expanded={settingsVisible}
                    aria-controls={settingsPanelId}
                  />
                )}
                {!readOnly && (
                  <ToolbarIconButton
                    icon={<MovieOutlinedIcon />}
                    tooltip={t("screens4_20.storyboardBoard.oneTake")}
                    onClick={toggleOneTake}
                    active={oneTakeOpen}
                    aria-expanded={oneTakeOpen}
                    aria-controls={oneTakePanelId}
                  />
                )}
                {!readOnly && actionsMenu}
                {!readOnly && downloadingStatus}
              </FlexRow>
              {!readOnly && (
                <FlexRow gap={SPACING.sm}>
                  {renderStillsButton}
                  {renderClipsButton}
                </FlexRow>
              )}
            </FlexColumn>
          )}

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
                sx={{ width: "100%" }}
              >
                <FlexColumn gap={SPACING.xl}>
                  <SectionHeader
                    title={t("screens4_20.storyboardBoard.boardSettings")}
                    size="medium"
                    action={
                      <CloseButton
                        tooltip={t("screens4_20.storyboardBoard.closeBoardSettings")}
                        onClick={closeSettings}
                      />
                    }
                  />
                  <FormGrid stackBelow={FORM_STACK_BELOW}>
                    <FormSection label={t("screens4_20.storyboardBoard.screenplay")}>
                      <TextInput
                        label={t("screens4_20.storyboardBoard.titleLabel")}
                        value={title}
                        placeholder={t("screens4_20.storyboardBoard.untitledFilm")}
                        onChange={(e) => setTitle(boardId, e.target.value)}
                      />
                      <TextArea
                        label={t("screens4_20.storyboardBoard.briefLabel")}
                        value={brief}
                        placeholder={t("screens4_20.storyboardBoard.briefPlaceholder")}
                        onChange={(value) => setBrief(boardId, value)}
                        minRows={3}
                      />
                      <TextInput
                        label={t("screens4_20.storyboardBoard.styleLabel")}
                        value={style}
                        placeholder={t("screens4_20.storyboardBoard.stylePlaceholder")}
                        onChange={(e) => setStyle(boardId, e.target.value)}
                      />
                      <FormField label={t("screens4_20.storyboardBoard.entitiesLabel")}>
                        <StoryboardEntitiesField
                          boardId={boardId}
                          entityIds={entityIds}
                          readOnly={readOnly}
                        />
                      </FormField>
                    </FormSection>

                    <FormSection label={t("screens4_20.storyboardBoard.direction")} sx={settingsRailSx}>
                      {/* The Studio shell pins the director model — a beginner
                          picks what the film looks like, not which LLM writes it. */}
                      {!inStudio && (
                        <FormField label={t("screens4_20.storyboardBoard.screenplayModel")} sx={modelFieldSx}>
                          <LanguageModelSelect
                            value={directorModel?.id ?? ""}
                            onChange={(value) =>
                              setDirectorModel(boardId, value)
                            }
                          />
                        </FormField>
                      )}
                      <SelectField
                        label={t("screens4_20.storyboardBoard.aspectRatio")}
                        value={aspectRatio}
                        onChange={(value) => setAspectRatio(boardId, value)}
                        options={ASPECT_OPTIONS}
                      />
                      <SelectField
                        label={t("screens4_20.storyboardBoard.shotsLabel")}
                        value={shotCount}
                        onChange={(value) => setShotCount(Number(value))}
                        options={SHOT_COUNT_OPTIONS.map((count) => ({
                          value: count,
                          label: t("screens4_20.storyboardBoard.shotCountOption", { count })
                        }))}
                      />
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
                      color={
                        directError || assembleError ? "error" : "secondary"
                      }
                    >
                      {directError ??
                        assembleError ??
                        (hasShots
                          ? t("screens4_20.storyboardBoard.redirectDescription")
                          : t("screens4_20.storyboardBoard.directDescription"))}
                    </Caption>
                    <EditorButton
                      variant="contained"
                      color="primary"
                      onClick={handleDirect}
                      disabled={!onDirect || directing}
                    >
                      {directing
                        ? t("screens4_20.storyboardBoard.directing")
                        : hasShots
                          ? t("screens4_20.storyboardBoard.redirect")
                          : t("screens4_20.storyboardBoard.direct")}
                    </EditorButton>
                  </FlexRow>
                </FlexColumn>
              </Panel>
            </Collapse>
          )}

          {!readOnly && (
            <Collapse in={oneTakeOpen} timeout="auto" unmountOnExit>
              <OneTakePanel
                boardId={boardId}
                id={oneTakePanelId}
                onClose={closeOneTake}
              />
            </Collapse>
          )}

          <Dialog
            open={renderDialog === "stills"}
            onClose={() => setRenderDialog(null)}
            title={t("screens4_20.storyboardBoard.renderStills")}
            onConfirm={handleGenerateAllStills}
            confirmText={`${t("screens4_20.storyboardBoard.renderStills")}${
              stillsCost.pricedRequestCount > 0 && stillsCost.cost > 0
                ? ` · ~${formatCost(stillsCost.cost)}`
                : ""
            }`}
            confirmDisabled={!stillSelection}
          >
            <FlexColumn gap={SPACING.md}>
              <Caption color="secondary">
                {t("screens4_20.storyboardBoard.stillBatchModelHelp")}
              </Caption>
              <FormField label={t("screens4_20.storyboardBoard.stillModel")} sx={modelFieldSx}>
                <ImageModelSelect
                  value={stillSelection?.id ?? ""}
                  provider={stillSelection?.provider}
                  task={STILL_MODEL_TASKS}
                  onChange={setStillSelection}
                />
                {entityIds.length > 0 && (
                  <EntityStillModelWarning
                    modelId={stillSelection?.id}
                    provider={stillSelection?.provider}
                  />
                )}
              </FormField>
              <RenderCostSummary estimate={stillsCost} />
              {followUpClipsCost.pricedRequestCount > 0 &&
                followUpClipsCost.cost > 0 && (
                  <Caption color="secondary">
                    {t("screens4_20.storyboardBoard.followUpClipCost", {
                      clipCost: formatCost(followUpClipsCost.cost),
                      totalCost: formatCost(stillsCost.cost + followUpClipsCost.cost)
                    })}
                  </Caption>
                )}
            </FlexColumn>
          </Dialog>

          <Dialog
            open={renderDialog === "clips"}
            onClose={() => setRenderDialog(null)}
            title={t("screens4_20.storyboardBoard.renderClips")}
            onConfirm={handleGenerateAllClips}
            confirmText={`${t("screens4_20.storyboardBoard.renderClips")}${
              clipsCost.pricedRequestCount > 0 && clipsCost.cost > 0
                ? ` · ~${formatCost(clipsCost.cost)}`
                : ""
            }`}
            confirmDisabled={clipModelTasks.some(
              (task) => !clipSelections[task]
            )}
          >
            <FlexColumn gap={SPACING.md}>
              <Caption color="secondary">
                {t("screens4_20.storyboardBoard.clipBatchModelHelp")}
              </Caption>
              {clipModelTasks.map((task) => (
                <FormField
                  key={task}
                  label={CLIP_TASK_LABELS[task]}
                  sx={modelFieldSx}
                >
                  <VideoModelSelect
                    value={clipSelections[task]?.id ?? ""}
                    provider={clipSelections[task]?.provider}
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
            title={t("screens4_20.storyboardBoard.redirectConfirmTitle")}
            onConfirm={handleConfirmRedirect}
            confirmText={t("screens4_20.storyboardBoard.redirect")}
            destructive
          >
            <FlexColumn gap={SPACING.xs}>
              <Text>
                {t("screens4_20.storyboardBoard.redirectConfirmBody", { count: shots.length })}
              </Text>
              <Caption color="secondary">
                {t("screens4_20.storyboardBoard.redirectConfirmNote")}
              </Caption>
            </FlexColumn>
          </Dialog>

          <Dialog
            open={assembleConfirmOpen}
            onClose={() => setAssembleConfirmOpen(false)}
            title={t("screens4_20.storyboardBoard.rebuildTimelineConfirmTitle")}
            onConfirm={handleConfirmAssemble}
            confirmText={t("screens4_20.storyboardBoard.rebuildTimeline")}
            destructive
          >
            <FlexColumn gap={SPACING.xs}>
              <Text>
                {replacedClipCount === null
                  ? t("screens4_20.storyboardBoard.replaceAllOwnedClips")
                  : t("screens4_20.storyboardBoard.replaceOwnedClips", { count: replacedClipCount })}
              </Text>
              <Caption color="secondary">
                {t("screens4_20.storyboardBoard.externalTimelinePreserved")}
                {skippedAssemblyCount > 0
                  ? ` ${t("screens4_20.storyboardBoard.skippedShots", { count: skippedAssemblyCount })}`
                  : ""}
              </Caption>
            </FlexColumn>
          </Dialog>

          <Dialog
            open={downloadFallbackError !== null}
            onClose={() => setDownloadFallbackError(null)}
            title={t("screens4_20.storyboardBoard.latestChangesNotSaved")}
            onConfirm={() => {
              setDownloadFallbackError(null);
              void downloadZip(false);
            }}
            confirmText={t("screens4_20.storyboardBoard.downloadLastSaved")}
          >
            <FlexColumn gap={SPACING.md}>
              <Text>
                {t("screens4_20.storyboardBoard.downloadOlderVersionNotice")}
              </Text>
              <AlertBanner severity="error">{downloadFallbackError}</AlertBanner>
            </FlexColumn>
          </Dialog>

          {previewOpen && (
            <React.Suspense
              fallback={<LoadingSpinner size="small" text={t("screens4_20.storyboardBoard.loadingPreview")} />}
            >
              <LazyStoryboardPreview boardId={boardId} />
            </React.Suspense>
          )}

          {directing ? (
            <FlexColumn gap={SPACING.md}>
              <Caption color="primary">
                {t("screens4_20.storyboardBoard.directorWriting")}
              </Caption>
              <Box sx={shotGridSx(cardSize)}>
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
              title={t("screens4_20.storyboardBoard.noShotsTitle")}
              description={
                readOnly
                  ? t("screens4_20.storyboardBoard.noShotsReadOnly")
                  : t("screens4_20.storyboardBoard.noShotsDescription")
              }
            />
          ) : (
            <FlexColumn gap={SPACING.lg} sx={{ minWidth: 0 }}>
              <FlexRow align="center" gap={SPACING.md} wrap>
                <SearchInput
                  ref={searchRef}
                  value={shotQuery}
                  onChange={setShotQuery}
                  onSubmit={handleSearchSubmit}
                  placeholder={t("screens4_20.storyboardBoard.searchShotsPlaceholder")}
                  ariaLabel={t("screens4_20.storyboardBoard.searchShotsLabel")}
                  size="small"
                  sx={{ width: "100%", maxWidth: "40ch" }}
                />
                {searching && (
                  <Caption color="secondary" role="status">
                    {t("screens4_20.storyboardBoard.shotSearchCount", {
                      visible: visibleShotIds.length,
                      total: shots.length
                    })}
                  </Caption>
                )}
              </FlexRow>
              {visibleGroups.length === 0 ? (
                <EmptyState
                  variant="empty"
                  title={t("screens4_20.storyboardBoard.noMatchingShotsTitle")}
                  description={t("screens4_20.storyboardBoard.noMatchingShotsDescription")}
                />
              ) : (
                <FlexRow
                  ref={gridRef}
                  role="group"
                  aria-label={t("screens4_20.storyboardBoard.shotsGroupLabel")}
                  onKeyDown={handleGridKeyDown}
                  align="flex-start"
                  wrap
                  gap={SPACING.xl}
                  sx={{ minWidth: 0 }}
                >
                  {visibleGroups.map((group) => (
                    // A legacy board has one group with no scene record; it gets the
                    // implicit header, and no `Scene` is written to get it.
                    <Box
                      key={group.sceneId ?? "unscened"}
                      role="group"
                      aria-label={t("screens4_20.storyboardBoard.sceneGroupLabel", { number: group.number })}
                      sx={{
                        ...shotGridSx(cardSize),
                        minWidth: 0,
                        flex:
                          group.shots.length > 1 ? "1 1 100%" : `1 1 ${cardSize}ch`,
                        maxWidth:
                          group.shots.length === 1
                            ? `${Math.max(80, cardSize)}ch`
                            : undefined
                      }}
                    >
                      <SceneHeader
                        number={group.number}
                        slugline={group.scene?.slugline || undefined}
                        actions={
                          readOnly || directing ? undefined : (
                            <SceneClipControls
                              sceneId={group.sceneId}
                              sceneShots={group.shots}
                              boardShots={shots}
                              clips={
                                sceneClipsByGroup.get(group.sceneId) ??
                                NO_SCENE_CLIPS
                              }
                              onOpen={openSceneClip}
                            />
                          )
                        }
                      />
                      {group.shots.map((shot) => (
                        <Box key={shot.id} sx={shotSlotSx}>
                          <ShotCard
                            boardId={boardId}
                            shot={shot}
                            caption={captions.get(shot.id)}
                            durationSeconds={durations.get(shot.id)}
                            sceneClipTag={sceneClipTags.get(shot.id)}
                            renderContext={renderContext}
                            selected={shot.id === activeShotId}
                            onSelect={handleSelectShot}
                            readOnly={readOnly}
                            draggable={!readOnly && !directing && !searching}
                            dropTarget={shot.id === dropTargetId}
                            onDragStart={handleDragStart}
                            onDragEnter={handleDragEnter}
                            onDragEnd={handleDragEnd}
                            onDrop={handleDrop}
                            onEdit={readOnly ? undefined : handleEditShot}
                          />
                          {!readOnly && !directing && !searching && (
                            <ShotInsertPoint
                              afterShotId={shot.id}
                              label={captions.get(shot.id) ?? ""}
                              onInsert={handleInsertShot}
                            />
                          )}
                        </Box>
                      ))}
                    </Box>
                  ))}
                </FlexRow>
              )}
            </FlexColumn>
          )}

          {/* What comes after the board (PRD § 7.4). Both actions already exist
              — the script link control and the timeline handoff — and are shown
              here rather than in the spend toolbar, because neither renders. */}
          {!readOnly && (
            <FlexColumn gap={SPACING.xs}>
              <FlexRow align="flex-start" gap={SPACING.md} wrap>
                <ScriptLinkControl boardId={boardId} disabled={directing} />
                <EditorButton
                  variant="contained"
                  color="primary"
                  onClick={handleAssembleClick}
                  disabled={!onAssemble || assembling || !hasRenderedShot}
                >
                  {assembling
                    ? t("screens4_20.storyboardBoard.assembling")
                    : timelineId
                      ? t("screens4_20.storyboardBoard.rebuildLinkedTimeline")
                      : t("screens4_20.storyboardBoard.createTimeline")}
                </EditorButton>
                {timelineId && (
                  <EditorButton
                    variant="outlined"
                    startIcon={<MovieOutlinedIcon />}
                    onClick={handleOpenTimeline}
                  >
                    {t("screens4_20.storyboardBoard.openTimeline")}
                  </EditorButton>
                )}
              </FlexRow>
              {!hasRenderedShot && (
                <Caption color="secondary">
                  {hasUnselectedClip
                    ? t("screens4_20.storyboardBoard.setCurrentClipForTimeline")
                    : t("screens4_20.storyboardBoard.renderMediaForTimeline")}
                </Caption>
              )}
              {assembleError && (
                <ErrorBanner
                  report={{
                    source: "operation-failure",
                    summary: t("screens4_20.storyboardBoard.assembleErrorSummary"),
                    errorText: assembleError
                  }}
                >
                  {assembleError}
                </ErrorBanner>
              )}
            </FlexColumn>
          )}

          {slideshowStart !== undefined && (
            <StoryboardSlideshow
              boardId={boardId}
              startShotId={slideshowStart ?? activeShotId}
              onClose={closeSlideshow}
              onEditShot={readOnly ? undefined : handleEditShotFields}
            />
          )}

          <BoardStyleDialog
            boardId={boardId}
            open={styleOpen}
            onClose={closeStyle}
          />

          {sceneClipDialog && (
            <Suspense fallback={null}>
              <SceneClipDialog
                boardId={boardId}
                sceneShots={sceneClipDialog.sceneShots}
                clip={sceneClipDialog.clip}
                saved={sceneClipDialog.saved}
                onClose={closeSceneClip}
              />
            </Suspense>
          )}

          {activeShot && (
            <Box>
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
      {editing && (
        <Box sx={editOverlaySx}>
          <ShotEditPanel
            boardId={boardId}
            shotId={editing.shotId}
            focusDialogue={editing.focus === "dialogue"}
            readOnly={readOnly}
            onClose={closeEditing}
            onShotChange={handleEditingShotChange}
            leaveRequest={leaveRequest}
            onLeaveRequestComplete={handleLeaveRequestComplete}
          />
        </Box>
      )}
    </Box>
  );
};

export const StoryboardBoard = memo(StoryboardBoardInner);
StoryboardBoard.displayName = "StoryboardBoard";

export default StoryboardBoard;
