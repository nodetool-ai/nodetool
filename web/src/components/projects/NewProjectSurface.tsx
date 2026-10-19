/**
 * "What do you want to make?" — the editor home surface.
 *
 * The prompt opens a normal chat in the current project. The
 * box takes the chat composer's triggers: `/` completes a skill and `@` picks
 * an asset or a library entity, so the opening turn is written the same way
 * every other turn is. A starter is one of the user's skills — their own or one
 * NodeTool ships — and the prompt is the one record of which was picked: a
 * pill writes `/<name>` into the prompt, `/` completes it, and a hand-typed one
 * counts the same, so the pills light up from the text and can never disagree
 * with what the agent is handed. Blank documents keep
 * their place at the foot of the view, opening loose tabs the way the `+ New`
 * menu always did.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  DEFAULT_NATIVE_GAME_TEMPLATE,
  isModelSelected,
  type CreativeContext,
  type Entity,
  type ProductionReferenceBinding
} from "@nodetool-ai/protocol";
import { createTopDownRoomGame, createNative3DGame } from "@nodetool-ai/game-runtime";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";

import {
  BORDER_RADIUS,
  AlertBanner,
  Box,
  Caption,
  Chip,
  CloseButton,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  InspectorSelect,
  MenuItemPrimitive,
  ContextMenu,
  MOTION,
  reducedMotion,
  ResponsiveImage,
  ScrollArea,
  CONTROL,
  SPACING,
  SPACING_PX,
  Text,
  TextInput,
  Tooltip,
  TYPOGRAPHY
} from "../ui_primitives";
import type {
  Asset,
  LanguageModel,
  MessageContent,
  Workflow
} from "../../stores/ApiTypes";
import { useProjectDocumentTotal } from "./useProjectDocumentTotal";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { DroppedFile } from "../chat/types/chat.types";
import { useAssetStore } from "../../stores/AssetStore";
import {
  examplePackageName,
  exampleSeedRef
} from "../../utils/exampleWorkflow";
import type { BuildFromPlanResult } from "../../hooks/workflow/useBuildFromPlan";
import { useFileHandling } from "../chat/hooks/useFileHandling";
import { useComposerAssetUpload } from "../chat/hooks/useComposerAssetUpload";
import { isMac } from "../../utils/platform";
import { useTextareaAssetMention } from "../chat/composer/useTextareaAssetMention";
import { useTextareaSkillMention } from "../chat/composer/useTextareaSkillMention";
import { assetToUri } from "../node_types/editing/promptComposer/promptTokens";
import { assetIdFromLocator, assetIdOf } from "../../utils/mediaRef";
import { useEntities } from "../../serverState/useEntities";
import EntityPickerDialog from "../entities/EntityPickerDialog";
import { useNotificationStore } from "../../stores/NotificationStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import {
  PROJECT_NEW_REF,
  LOOSE_PROJECT_ID,
  creationProjectId,
  tabId,
  useWorkspaceTabsStore,
  type GuidedFlowTarget
} from "../../stores/WorkspaceTabsStore";
import {
  useOpenProject,
  useProjectSummaries
} from "../../hooks/useProjects";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import {
  TEXT_FILE_TEMPLATES,
  useNewDocumentCatalog,
  type NewDocumentSubmenu
} from "../workspace/newDocumentCatalog";
import {
  useCreateStoryboard,
  useExampleStoryboards
} from "../../hooks/storyboard/useStoryboards";
import { useLanguageProviderReadiness } from "../../hooks/useHasConfiguredProvider";
import {
  openProviderOnboarding,
  useProviderOnboardingStore
} from "../../stores/ProviderOnboardingStore";
import useOnboardingStore, {
  isOnboardingFinished
} from "../../stores/OnboardingStore";
import GettingStartedChecklist from "../onboarding/GettingStartedChecklist";
import StartExamples from "./StartExamples";
import CurrentProjectDocuments from "./CurrentProjectDocuments";
import RecentChats from "./RecentChats";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import ReportBugButton from "../support/ReportBugButton";
import { openPageTab } from "../workspace/openPageTab";
import {
  OPTION_CARD_CLASS,
  OptionCardGrid,
  type OptionCardItem
} from "../setup/OptionCardGrid";
import { ENTRY_CARDS, type EntryFlowId } from "../setup/entryCards";
import StoryboardSetupHost from "../setup/storyboard/StoryboardSetupHost";
import VideoSetupHost from "../setup/video/VideoSetupHost";
import ScriptSetupHost from "../setup/script/ScriptSetupHost";
import WorkflowSetupHost from "../setup/workflow/WorkflowSetupHost";
import GameSetupHost from "../setup/game/GameSetupHost";
import AppSetupHost, { type BuiltApp } from "../setup/app/AppSetupHost";
import type { GameStartAlternative } from "../setup/game/IdeaStep";
import type { BuildGameResult } from "../../hooks/game/useBuildGame";
import EntitySetupHost from "../setup/entity/EntitySetupHost";
import { newVideoSetupDocument } from "../setup/video/useVideoSetupFlow";
import { newScriptSetupDocument } from "../setup/script/useScriptSetupFlow";
import { startImageFlow } from "../setup/image/startImageFlow";
import { MAX_IMAGE_REFERENCES } from "../setup/image/setupContext";
import {
  useCreateTimeline,
  useDeleteTimeline,
  useSeedTimelineDetail
} from "../../hooks/useTimelineSequence";
import { useCreateScript } from "../../hooks/script/useScripts";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { trpcClient } from "../../trpc/client";
import {
  writeGameSetup,
  writeWorkflowSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { newDocumentId } from "../../lib/newDocumentId";
import { newStoryboardSetupDocument } from "../setup/storyboard/useStoryboardSetupFlow";
import { stageChatTurn } from "../chat/pendingChatTurn";
import { openSpeechChat } from "../chat/openSpeechChat";
import { PROJECT_COLOR } from "./projectIdentity";
import {
  composeFirstTurn,
  estimateFromHistory,
  formatEstimate,
  invokedStarter,
  projectNameFromPrompt,
  promptWithoutStarter,
  rankStarters,
  starterLabel,
  toggleStarterInPrompt,
  VISIBLE_STARTERS
} from "./projectStarters";
import { useSkills } from "../../hooks/skills/useSkills";
import storyboardBackground from "../../assets/guided-flows/storyboard.webp";
import videoBackground from "../../assets/guided-flows/video.webp";
import scriptBackground from "../../assets/guided-flows/script.webp";
import imageBackground from "../../assets/guided-flows/image.webp";
import workflowBackground from "../../assets/guided-flows/workflow.webp";
import gameBackground from "../../assets/guided-flows/game.webp";

const ENTRY_BACKGROUNDS: Partial<Record<EntryFlowId, string>> = {
  storyboard: storyboardBackground,
  video: videoBackground,
  script: scriptBackground,
  speech: scriptBackground,
  image: imageBackground,
  workflow: workflowBackground,
  game: gameBackground,
  app: workflowBackground
};

/** Width of the centered column, per the new-project mockup. */
const COLUMN_WIDTH = 860;
/** The measure of a centered line of intro copy, in px. */
const INTRO_TEXT_WIDTH = 640;
/** A dropped reference image's thumbnail, in px. */
const REFERENCE_THUMB_SIZE = 48;
/** The blank-document submenu's column, and the popover's room around it. */
const SUBMENU_WIDTH = 320;
const SUBMENU_MAX_WIDTH = 340;

/** A starter pill at rest: outlined, quiet, the project's colour on hover. */
/** A context control in the composer's toolbar: quiet until pointed at. */
const composerToolSx = {
  color: "text.secondary",
  borderRadius: BORDER_RADIUS.pill,
  "&:hover": { color: "text.primary", bgcolor: "action.hover" }
} as const;

interface SubmenuAnchor {
  kind: NewDocumentSubmenu;
  element: HTMLElement;
}

/**
 * The document an entry card created, which this tab then hosts.
 *
 * Discriminated because each flow lands somewhere different: a storyboard tab,
 * a timeline, a script, a workflow canvas — and the Game flow's own canvas,
 * which is a workflow too (D25). Image is absent on purpose — its flow renders
 * as an overlay on the sketch editor, so its card opens the editor straight
 * away rather than hosting a step here.
 * `ownsProject` says the card made the project row it files under. Set, and
 * "Change flow" deletes the row with the draft; unset, and the flow was
 * filed into the open project, which stays where it is.
 */
type SetupTarget = GuidedFlowTarget;

/** The notice asking for a model; dismissed once the model is picked. */
const PICK_MODEL_NOTICE_KEY = "new-project-pick-model";

const SETUP_TARGET_STORAGE_KEY = "nodetool-guided-setup-target";
const SETUP_TARGET_KINDS: ReadonlySet<string> = new Set([
  "entity",
  "storyboard",
  "video",
  "script",
  "workflow",
  "game",
  "app"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Restore the document route the New Project tab was hosting before reload. */
const readSetupTarget = (): SetupTarget | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(SETUP_TARGET_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored["version"] !== 1) {
      return null;
    }
    const value = stored["target"];
    if (
      !isRecord(value) ||
      typeof value["kind"] !== "string" ||
      !SETUP_TARGET_KINDS.has(value["kind"]) ||
      typeof value["id"] !== "string" ||
      typeof value["projectId"] !== "string" ||
      typeof value["name"] !== "string" ||
      typeof value["ownsProject"] !== "boolean" ||
      (value["initialAssetId"] !== undefined &&
        typeof value["initialAssetId"] !== "string") ||
      (value["initialDescriptor"] !== undefined &&
        typeof value["initialDescriptor"] !== "string")
    ) {
      return null;
    }
    return {
      kind: value["kind"] as SetupTarget["kind"],
      id: value["id"],
      projectId: value["projectId"],
      name: value["name"],
      ownsProject: value["ownsProject"],
      ...(typeof value["initialAssetId"] === "string" && {
        initialAssetId: value["initialAssetId"]
      }),
      ...(typeof value["initialDescriptor"] === "string" && {
        initialDescriptor: value["initialDescriptor"]
      })
    };
  } catch {
    return null;
  }
};

const writeSetupTarget = (target: SetupTarget | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (target) {
      window.sessionStorage.setItem(
        SETUP_TARGET_STORAGE_KEY,
        JSON.stringify({ version: 1, target })
      );
    } else {
      window.sessionStorage.removeItem(SETUP_TARGET_STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable. The current mounted flow remains usable.
  }
};

/** Which tab a finished flow opens. */
const SETUP_TAB_TYPE = {
  storyboard: "storyboard",
  video: "timeline",
  script: "script",
  workflow: "workflow",
  game: "game",
  app: "application"
} as const;

/** What a flow makes, in the creator's words. */
const setupKindTranslationKey: Record<SetupTarget["kind"], string> = {
  entity: "entity",
  storyboard: "storyboard",
  video: "video",
  script: "script",
  workflow: "workflow",
  game: "game",
  app: "app"
};

/**
 * One composer attachment, as a setup document may hold it.
 *
 * A durable locator only. Every setup document is PATCHed on each keystroke of
 * the brief, so a `data:` URI would push the file's bytes through autosave and
 * version history — the bytes go to the asset store first and the document
 * carries the `asset://` reference the store handed back.
 */
interface ComposerReference {
  uri: string;
  name: string;
  type: string;
}

/**
 * The composer's attachments as durable locators, uploading the ones that are
 * only bytes. A drag from the asset library already has its `asset://`
 * reference and is passed through untouched.
 */
const uploadComposerReferences = async (
  files: readonly DroppedFile[]
): Promise<ComposerReference[]> => {
  const createAsset = useAssetStore.getState().createAsset;
  const references: ComposerReference[] = [];
  for (const file of files) {
    if (file.assetUri) {
      references.push({ uri: file.assetUri, name: file.name, type: file.type });
      continue;
    }
    const blob = await (await fetch(file.dataUri)).blob();
    const asset = await createAsset(
      new File([blob], file.name, { type: file.type || blob.type })
    );
    references.push({
      uri: assetToUri(asset),
      name: file.name,
      type: file.type || blob.type
    });
  }
  return references;
};

/** Drop the draft document an entry card made. */
const deleteSetupDocument = async (target: SetupTarget): Promise<void> => {
  // Neither flow writes a document before it finishes.
  if (target.kind === "entity" || target.kind === "app") {
    return;
  }
  if (target.kind === "storyboard") {
    await trpcClient.storyboards.delete.mutate({ id: target.id });
    return;
  }
  if (target.kind === "script") {
    await trpcClient.scripts.delete.mutate({ id: target.id });
    return;
  }
  if (target.kind === "video") {
    await trpcClient.timeline.delete.mutate({ id: target.id });
    return;
  }
  // Workflow and Game both draft a workflow row.
  await trpcClient.workflows.delete.mutate({ id: target.id });
};

/**
 * What a graph build got wrong, one line each. Empty on a clean build.
 *
 * The flow's own surface is gone the moment this tab opens the canvas, so a
 * placement gap, a validation error or a refused run has to be said here or it
 * is never said at all. Both graph flows land here: the Workflow flow calls its
 * one run a test run, the Game flow just runs the graph, and the two results
 * differ only in that name.
 */
const buildFailures = (result: BuildFromPlanResult, t: TFunction): string[] => {
  const lines: string[] = [];
  if (result.issues.length > 0) {
    lines.push(
      t("pass3_32.projects.home.buildFailures.connections", { count: result.issues.length })
    );
  }
  if (result.validationErrors.length > 0) {
    lines.push(
      t("pass3_32.projects.home.buildFailures.validation", { errors: result.validationErrors.join("; ") })
    );
  }
  const run = result.testRun;
  if (run.error) {
    lines.push(t("pass3_32.projects.home.buildFailures.runRefused", { error: run.error }));
  }
  return lines;
};

/** What a game build could not draw, one line. Empty when every slot drew. */
const gameBuildFailures = (game: BuildGameResult, t: TFunction): string[] =>
  game.failures.length === 0
    ? []
    : [
        t("pass3_32.projects.home.buildFailures.gameArt", {
          count: game.failures.length,
          slots: game.failures.map((failure) => failure.slot).join(", "),
          reason: game.failures[0]?.reason ?? ""
        })
      ];

/**
 * Remove the workflow row that carried a finished Game flow. The game is the
 * document from here on, and the row would otherwise sit in the workflow list
 * as an empty "game" workflow. Best effort: the game is already open.
 */
const discardGameSetupWorkflow = async (workflowId: string): Promise<void> => {
  try {
    await trpcClient.workflows.delete.mutate({ id: workflowId });
  } catch {
    // The game opened; an orphaned setup row is harmless.
  }
};

interface NewProjectSurfaceProps {
  flowRef?: string;
  initialSetupTarget?: SetupTarget | null;
  /** False while this workspace tab is hidden behind another one. */
  active?: boolean;
}

const NewProjectSurface = ({
  flowRef,
  initialSetupTarget,
  active = true
}: NewProjectSurfaceProps) => {
  const { t } = useTranslation();
  const setupKindName = useCallback(
    (kind: SetupTarget["kind"]) =>
      t(`pass3_32.projects.home.flowNames.${setupKindTranslationKey[kind]}`),
    [t]
  );
  const [prompt, setPrompt] = useState("");
  const [showMoreFlows, setShowMoreFlows] = useState(false);
  const [gameDimension, setGameDimension] = useState<"2d" | "3d">("2d");
  // The starter row folds past `VISIBLE_STARTERS` until asked to show the rest.
  const [showAllStarters, setShowAllStarters] = useState(false);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [submenu, setSubmenu] = useState<SubmenuAnchor | null>(null);
  const [starting, setStarting] = useState(false);
  const modelCreationInFlight = useRef(false);
  // The card that was clicked, while its documents are being made. Set, and
  // that card says so while the other cards are off (PRD § 6.1: one click
  // creates the row and the document, so a second one has nothing to add).
  const [pendingFlow, setPendingFlow] = useState<EntryFlowId | null>(null);
  // Each guided tab owns its target; the editor home keeps none.
  const [setupTarget, setSetupTarget] = useState<SetupTarget | null>(
    initialSetupTarget ?? null
  );
  // The model for the first chat turn. The prompt box has no model chip.
  const [modelAnchor, setModelAnchor] = useState<HTMLElement | null>(null);
  // A start requested before a provider was configured, resumed once one is.
  const [pendingStart, setPendingStart] = useState(false);
  // A start parked on the model menu, resumed once a model is picked.
  const [pendingModelStart, setPendingModelStart] = useState(false);
  // The flow can swap its own target and finish in the same tick — the example
  // route replaces the placeholder workflow with the copy, then finishes — so
  // the handlers read this rather than the render's copy of the state.
  const setupTargetRef = useRef<SetupTarget | null>(setupTarget);
  // Whether this guided tab is the one on screen. The New Project tab itself
  // (no `flowRef`) only finishes from a click, so it always is. The workflow
  // build opens the flow's own document to reach its canvas, and a creator
  // looking at that document is looking at the flow too.
  const guidedTabActive = useWorkspaceTabsStore(
    (state) =>
      !flowRef ||
      state.activeTabId === tabId("guided-flow", flowRef) ||
      (setupTarget !== null &&
        setupTarget.kind in SETUP_TAB_TYPE &&
        state.activeTabId ===
          tabId(
            SETUP_TAB_TYPE[setupTarget.kind as keyof typeof SETUP_TAB_TYPE],
            setupTarget.id
          ))
  );
  const guidedTabActiveRef = useRef(guidedTabActive);
  guidedTabActiveRef.current = guidedTabActive;
  // A finish that could not hand off yet: held while this tab is hidden, or
  // after its project failed to open.
  const [heldFinish, setHeldFinish] = useState<{
    result?: BuildFromPlanResult | null;
    game?: BuildGameResult;
    app?: BuiltApp;
  } | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes once a pill has rewritten the prompt: back in the
  // box, at the end, so the user keeps typing without a click.
  const pendingCaretRef = useRef<number | null>(null);

  const {
    droppedFiles,
    addDroppedFiles,
    removeFile,
    clearFiles,
    getFileContents
  } = useFileHandling();
  const { uploadFiles, isUploading } = useComposerAssetUpload(addDroppedFiles);
  const referenceImageCount = droppedFiles.filter((file) =>
    file.type.startsWith("image/")
  ).length;
  const { data: entities } = useEntities();
  // Both the user's own skills and the ones NodeTool ships: either is a
  // starter, and either is invoked the same way.
  const { data: skills } = useSkills({ includeSystem: true });
  const summaries = useProjectSummaries();
  const createStoryboard = useCreateStoryboard();
  const createTimeline = useCreateTimeline();
  const deleteTimeline = useDeleteTimeline();
  const seedTimelineDetail = useSeedTimelineDetail();
  const createScript = useCreateScript();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const openProject = useOpenProject();
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const hasHomeTab = useWorkspaceTabsStore((state) =>
    state.tabs.some((tab) => tab.id === tabId("project-new", PROJECT_NEW_REF))
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const setActiveProjectId = useWorkspaceTabsStore(
    (state) => state.setActiveProjectId
  );
  const setGuidedFlowTarget = useWorkspaceTabsStore(
    (state) => state.setGuidedFlowTarget
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const removeNotificationsByKey = useNotificationStore(
    (state) => state.removeNotificationsByKey
  );
  const providerReadiness = useLanguageProviderReadiness();
  const hasConfiguredProvider = providerReadiness.ready;
  const selectedModel = useGlobalChatStore((state) => state.selectedModel);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const setSelectedModel = useGlobalChatStore(
    (state) => state.setSelectedModel
  );
  // The checklist retires once the getting-started steps are done or
  // dismissed; veterans get the plain project surface.
  const showOnboarding = useOnboardingStore(
    (state) =>
      !isOnboardingFinished({
        completedSteps: state.completedSteps,
        dismissed: state.dismissed
      })
  );

  // Blank documents opened from here are loose, as the strip promises — the
  // project being described does not exist yet.
  const {
    entries,
    createTextFile,
    createBlankStoryboard,
    installStoryboardExample,
    creating
  } = useNewDocumentCatalog({ projectId: LOOSE_PROJECT_ID }, () => {
    setSubmenu(null);
    useOnboardingStore.getState().markStep("keep-creating");
  });
  const { entries: projectEntries } = useNewDocumentCatalog({}, () => {
    useOnboardingStore.getState().markStep("keep-creating");
  });
  const modelEntry = projectEntries.find((entry) => entry.key === "model3d");
  const { data: exampleData, isLoading: examplesLoading } =
    useExampleStoryboards(submenu?.kind === "storyboards");

  const selectedEntities = useMemo(
    () => (entities ?? []).filter((entity) => entityIds.includes(entity.id)),
    [entities, entityIds]
  );

  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const projectDocumentTotal = useProjectDocumentTotal();

  /**
   * Make a document's project the one on screen before its tab opens. The
   * shell shows only the active project's tabs, so a tab filed into a project
   * that is not open stays hidden, and closing this tab then leaves the start
   * page. False when the project did not open; `openProject` says why.
   */
  const showDocumentProject = useCallback(
    async (projectId: string, fallbackName: string): Promise<boolean> => {
      if (projectId === LOOSE_PROJECT_ID || projectId === activeProjectId) {
        return true;
      }
      const match = (summaries.data ?? []).find(
        (summary) => summary.project.id === projectId
      );
      return openProject({
        id: projectId,
        name: match?.project.name ?? fallbackName
      });
    },
    [activeProjectId, openProject, summaries.data]
  );

  const starters = useMemo(
    () => rankStarters(skills ?? [], summaries.data ?? []),
    [skills, summaries.data]
  );

  // Read off the prompt, so a `/name` typed by hand lights its pill and a
  // deleted one goes dark. A skill the catalog no longer carries is no
  // starter at all, rather than a `/name` the agent would fail to resolve.
  const starter = useMemo(
    () => invokedStarter(prompt, starters),
    [prompt, starters]
  );

  // A guided flow takes the prompt as its idea, without the `/name` a starter
  // pill wrote: the flow has no use for it, and it would land in the idea
  // field and the tab name.
  const flowPrompt = useMemo(
    () => (starter ? promptWithoutStarter(prompt, starter.name) : prompt),
    [prompt, starter]
  );

  // The folded row still shows the picked starter, wherever it ranks, so the
  // pill that is lit is never one that is hidden.
  const visibleStarters = useMemo(() => {
    if (showAllStarters || starters.length <= VISIBLE_STARTERS) {
      return starters;
    }
    const head = starters.slice(0, VISIBLE_STARTERS);
    return starter && !head.includes(starter) ? [...head, starter] : head;
  }, [showAllStarters, starter, starters]);
  const hiddenStarterCount = starters.length - visibleStarters.length;

  const handleToggleStarter = useCallback(
    (name: string) => {
      const next = toggleStarterInPrompt(
        prompt,
        starter?.name ?? null,
        starter?.name === name ? null : name
      );
      pendingCaretRef.current = next.length;
      setPrompt(next);
    },
    [prompt, starter]
  );

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }
    pendingCaretRef.current = null;
    const element = promptRef.current;
    if (element) {
      element.focus();
      element.setSelectionRange(caret, caret);
    }
  }, [prompt]);

  const estimate = useMemo(
    () => estimateFromHistory(summaries.data ?? [], starter?.name ?? ""),
    [starter, summaries.data]
  );

  const toggleEntity = useCallback((entity: Entity) => {
    setEntityIds((ids) =>
      ids.includes(entity.id)
        ? ids.filter((id) => id !== entity.id)
        : [...ids, entity.id]
    );
  }, []);

  // The prompt box carries the composer's own triggers: `@` picks an asset or
  // a library entity, `/` picks the skill to start from. A picked asset is
  // attached as an `asset://` reference the way a dropped file is; a picked
  // entity is written inline as its `entity://<id>` token, which the server
  // resolves per turn.
  const handleSelectAsset = useCallback(
    (asset: Asset) => {
      addDroppedFiles([
        {
          id: "",
          dataUri: asset.thumb_url || asset.get_url || "",
          type: asset.content_type || "application/octet-stream",
          name: asset.name || asset.id,
          assetUri: assetToUri(asset)
        }
      ]);
    },
    [addDroppedFiles]
  );

  const { mentionMenu, handleKeyDown: handleMentionKeyDown } =
    useTextareaAssetMention({
      textareaRef: promptRef,
      value: prompt,
      setValue: setPrompt,
      onSelectAsset: handleSelectAsset,
      includeEntities: true
    });

  // A skill picked from `/` is written into the prompt as `/name`, which is
  // all it takes to make it the starter: the pills and the project's kind
  // both read the prompt.
  const { skillMenu, handleKeyDown: handleSkillKeyDown } =
    useTextareaSkillMention({
      textareaRef: promptRef,
      value: prompt,
      setValue: setPrompt
    });

  const handleRefImages = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      // The picker's image filter is a default a person can switch off, and a
      // text file taken as a reference showed as a broken picture.
      const images = files.filter((file) => file.type.startsWith("image/"));
      const skipped = files.filter((file) => !file.type.startsWith("image/"));
      if (skipped.length > 0) {
        addNotification({
          type: "warning",
          alert: true,
          content: t("pass3_32.projects.home.unsupportedReferenceFiles", {
            files: skipped.map((file) => file.name).join(", "),
            count: skipped.length
          })
        });
      }
      if (images.length > 0) {
        uploadFiles(images);
      }
      // Clear the input so picking the same file twice still registers.
      event.target.value = "";
    },
    [addNotification, uploadFiles, t]
  );

  const handleStart = useCallback(async () => {
    const text = prompt.trim();
    if (text.length === 0 || starting || isUploading) {
      return;
    }
    // The first chat turn needs a model; route key-less users
    // through provider onboarding first and resume the start once connected.
    if (providerReadiness.loading) {
      addNotification({
        type: "info",
        alert: true,
        content: t("pass3_32.projects.home.checkingModels")
      });
      return;
    }
    if (!hasConfiguredProvider) {
      setPendingStart(true);
      openProviderOnboarding({
        capability: "generate_message",
        reason: t("pass3_32.projects.home.chatNeedsModel")
      });
      return;
    }
    // A configured provider is not a picked model: the chat's model selection
    // starts on the "empty" sentinel, and a send with it never leaves the
    // client. Open this surface's own model menu rather than point at a
    // composer that is not on this screen, and start once a model is picked.
    // The Settings default language model counts: a connected account starts
    // the chat at once, and the model menu stays a way to change it.
    let sendModel = selectedModel;
    if (!isModelSelected(sendModel)) {
      const languageDefault =
        useModelPreferencesStore.getState().defaults["language_model"];
      if (languageDefault) {
        sendModel = {
          type: "language_model",
          provider: languageDefault.provider,
          id: languageDefault.id,
          name: languageDefault.name
        } as LanguageModel;
        setSelectedModel(sendModel);
      }
    }
    if (!isModelSelected(sendModel)) {
      setPendingModelStart(true);
      setModelAnchor(modelButtonRef.current);
      addNotification({
        type: "info",
        alert: true,
        content: t("pass3_32.projects.home.pickModelToStartChat"),
        dedupeKey: PICK_MODEL_NOTICE_KEY
      });
      return;
    }
    setStarting(true);
    try {
      const content: MessageContent[] = [
        {
          type: "text",
          text: composeFirstTurn({
            prompt: text,
            starter,
            entityIds: selectedEntities.map((entity) => entity.id)
          })
        },
        ...getFileContents()
      ];
      const projectId = creationProjectId();
      const threadId = await createNewThread(undefined, null, { projectId });
      stageChatTurn(threadId, content);
      openTab({
        type: "chat",
        ref: threadId,
        mode: "view",
        title: t("pass3_32.projects.home.newChat"),
        projectId
      });
      useOnboardingStore.getState().markIdeaDescribed();
      closeTab(
        tabId(flowRef ? "guided-flow" : "project-new", flowRef ?? PROJECT_NEW_REF)
      );
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: t("pass3_32.projects.home.openChatError", {
          error: error instanceof Error ? error.message : String(error)
        })
      });
    } finally {
      setStarting(false);
    }
  }, [
    addNotification,
    closeTab,
    createNewThread,
    flowRef,
    getFileContents,
    hasConfiguredProvider,
    isUploading,
    providerReadiness.loading,
    openTab,
    prompt,
    t,
    selectedEntities,
    selectedModel,
    setSelectedModel,
    starter,
    starting
  ]);

  // A new flow gets its own tab. Changes within that flow keep the same tab.
  // Every target records what the composer held, so "Change flow" can put it
  // back (O6). A swap within the flow keeps the record it already had: the
  // composer of a tab opened from Home is empty while the flow runs.
  const applySetupTarget = useCallback((next: SetupTarget | null) => {
    const target: SetupTarget | null =
      next && !next.carried
        ? {
            ...next,
            carried: setupTargetRef.current?.carried ?? {
              references: droppedFiles.flatMap((file) =>
                file.assetUri
                  ? [{ uri: file.assetUri, name: file.name, type: file.type }]
                  : []
              ),
              entityIds
            }
          }
        : next;
    if (flowRef) {
      setupTargetRef.current = target;
      setSetupTarget(target);
      setGuidedFlowTarget(flowRef, target);
    } else if (target) {
      if (!hasHomeTab) {
        openTab({
          type: "project-new",
          ref: PROJECT_NEW_REF,
          mode: "view",
          title: t("pass3_32.projects.home.homeTab")
        });
      }
      const ref = crypto.randomUUID();
      const id = openTab({
        type: "guided-flow",
        ref,
        mode: "edit",
        title: target.name,
        projectId: target.projectId,
        setupTarget: target
      });
      setActiveTab(id);
    }
  }, [
    droppedFiles,
    entityIds,
    flowRef,
    hasHomeTab,
    openTab,
    setActiveTab,
    setGuidedFlowTarget,
    t
  ]);

  // Carry an in-progress flow from the former single-tab session storage into
  // a normal guided tab once. The draft itself already lives in its document.
  useEffect(() => {
    if (flowRef) return;
    const legacyTarget = readSetupTarget();
    if (!legacyTarget) return;
    writeSetupTarget(null);
    applySetupTarget(legacyTarget);
  }, [flowRef, applySetupTarget]);

  /** One message for every card, so a failed create never dead-ends silently. */
  const reportEntryFailure = useCallback(
    (flow: string, error: unknown) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("pass3_32.projects.home.startFlowError", {
          flow: t(`pass3_32.projects.home.flowNames.${flow}`, { defaultValue: flow }),
          error: error instanceof Error ? error.message : String(error)
        })
      });
    },
    [addNotification, t]
  );

  /**
   * Say what the composer holds that the chosen flow has no field for.
   *
   * PRD § 6.1 carries the typed prompt into step 1 and promises nothing else.
   * The flow targets hold different amounts of the rest, so the caller says
   * what its flow took. Naming what stays behind beats dropping it without a
   * word.
   */
  const noteUncarriedContext = useCallback(
    (
      flow: string,
      // `references` is a count when the flow takes only so many.
      carries: { entities: boolean; references: boolean | number }
    ) => {
      const left: string[] = [];
      const carried =
        carries.references === true
          ? droppedFiles.length
          : carries.references === false
            ? 0
            : carries.references;
      const leftOver = droppedFiles.length - carried;
      if (leftOver > 0) {
        left.push(t("pass3_32.projects.home.referenceImageCount", { count: leftOver }));
      }
      if (!carries.entities && selectedEntities.length > 0) {
        left.push(
          selectedEntities.length === 1
            ? t("pass3_32.projects.home.singleEntity", { name: selectedEntities[0].name })
            : t("pass3_32.projects.home.entityCount", { count: selectedEntities.length })
        );
      }
      if (left.length === 0) {
        return;
      }
      addNotification({
        type: "info",
        alert: true,
        content: t("pass3_32.projects.home.uncarriedContext", {
          flow: t(`pass3_32.projects.home.flowNames.${flow}`, { defaultValue: flow }),
          items: left.join(", ")
        })
      });
    },
    [addNotification, droppedFiles, selectedEntities, t]
  );

  // The Storyboard entry card (PRD § 6.1, D2). Explicit: nothing typed in the
  // prompt box reaches the flow unless this card is clicked — a plain prompt
  // and a `/skill` prompt both keep going to normal chat through
  // `handleStart`. The board is created with its stage already at `idea` and
  // the typed prompt as its brief, so the flow resumes from the document
  // alone (D3). The board is filed into the selected project.
  const startStoryboardFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.storyboard");
      setStarting(true);
      try {
        const board = await createStoryboard.mutateAsync({
          name,
          projectId,
          document: {
            ...newStoryboardSetupDocument(text),
            // The one setup document with a cast field, so the entities picked
            // in the composer come along.
            entityIds
          }
        });
        noteUncarriedContext("storyboard", {
          entities: true,
          references: false
        });
        applySetupTarget({
          kind: "storyboard",
          id: board.id,
          projectId,
          name,
          ownsProject: false
        });
      } catch (error) {
        reportEntryFailure("storyboard", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      createStoryboard,
      entityIds,
      noteUncarriedContext,
      flowPrompt,
      reportEntryFailure,
      starting,
      t
    ]
  );

  // The Video card. `timeline.create` takes no document, so the setup goes in
  // as one PATCH straight after — the flow reads it off the loaded sequence.
  const startVideoFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.video");
      setStarting(true);
      // The sequence made before its setup PATCH. A failure in between
      // deletes it, so no empty timeline is left in the project (F15).
      let unfinishedId: string | null = null;
      try {
        const references = await uploadComposerReferences(droppedFiles);
        const sequence = await createTimeline.mutateAsync({
          name,
          projectId
        });
        unfinishedId = sequence.id;
        const entityReferenceBindings: ProductionReferenceBinding[] =
          selectedEntities.flatMap((entity) => {
            const assetId = assetIdOf(entity.reference_images?.[0]);
            if (!assetId) {
              return [];
            }
            return [
              {
                kind: entity.kind === "prop" ? "product" : entity.kind,
                asset_id: assetId,
                entity_id: entity.id,
                label: entity.name
              }
            ];
          });
        const withSetup = await trpcClient.timeline.update.mutate({
          id: sequence.id,
          document: newVideoSetupDocument(text, {
            references: references.map(({ uri, name: fileName }) => ({
              uri,
              name: fileName,
              role: "product"
            })),
            entityIds,
            ...(entityReferenceBindings.length > 0 && {
              creativeContext: {
                schema_version: 1,
                reference_bindings: entityReferenceBindings
              }
            })
          })
        });
        unfinishedId = null;
        // The create seeded the detail cache with a sequence that has no setup;
        // the flow's first render must not read that copy (see
        // `useSeedTimelineDetail`).
        seedTimelineDetail(withSetup);
        noteUncarriedContext("video", { entities: true, references: true });
        applySetupTarget({
          kind: "video",
          id: sequence.id,
          projectId,
          name,
          ownsProject: false
        });
      } catch (error) {
        if (unfinishedId !== null) {
          await deleteTimeline
            .mutateAsync({ id: unfinishedId })
            .catch(() => undefined);
        }
        reportEntryFailure("video", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      createTimeline,
      deleteTimeline,
      droppedFiles,
      entityIds,
      noteUncarriedContext,
      flowPrompt,
      reportEntryFailure,
      seedTimelineDetail,
      selectedEntities,
      starting,
      t
    ]
  );

  const startScriptFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.script");
      setStarting(true);
      try {
        const references = await uploadComposerReferences(droppedFiles);
        const script = await createScript.mutateAsync({
          name,
          projectId,
          document: newScriptSetupDocument(text, {
            attachments: references.map(({ uri, name: fileName, type }) => ({
              uri,
              name: fileName,
              contentType: type
            })),
            entityIds
          })
        });
        noteUncarriedContext("script", { entities: true, references: true });
        applySetupTarget({
          kind: "script",
          id: script.id,
          projectId,
          name,
          ownsProject: false
        });
      } catch (error) {
        reportEntryFailure("script", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      createScript,
      droppedFiles,
      entityIds,
      noteUncarriedContext,
      flowPrompt,
      reportEntryFailure,
      starting,
      t
    ]
  );

  // Image has no step host: its flow is an overlay the sketch editor renders,
  // so the card opens the editor and the overlay resumes from the document's
  // stage (PRD § 10.4).
  const startImageProject = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.image");
      setStarting(true);
      try {
        const references = await uploadComposerReferences(droppedFiles);
        const started = await startImageFlow({
          name,
          projectId,
          brief: text,
          references,
          entityIds
        });
        noteUncarriedContext("image", {
          entities: true,
          references: Math.min(references.length, MAX_IMAGE_REFERENCES)
        });
        if (!(await showDocumentProject(projectId, name))) {
          return;
        }
        if (!hasHomeTab) {
          openTab({
            type: "project-new",
            ref: PROJECT_NEW_REF,
            mode: "view",
            title: t("pass3_32.projects.home.homeTab")
          });
        }
        openTab({
          type: "sketch",
          ref: started.documentId,
          mode: "edit",
          title: name,
          projectId
        });
        if (flowRef) closeTab(tabId("guided-flow", flowRef));
      } catch (error) {
        reportEntryFailure("image", error);
      } finally {
        setStarting(false);
      }
    },
    [
      closeTab,
      droppedFiles,
      entityIds,
      flowRef,
      hasHomeTab,
      noteUncarriedContext,
      openTab,
      flowPrompt,
      reportEntryFailure,
      showDocumentProject,
      starting,
      t
    ]
  );

  const startWorkflowFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.workflow");
      setStarting(true);
      try {
        const created = await createWorkflow({
          name,
          description: "",
          tags: [],
          access: "private",
          project_id: projectId,
          settings: writeWorkflowSetup({}, { stage: "idea", brief: text })
        });
        noteUncarriedContext("workflow", {
          entities: false,
          references: false
        });
        applySetupTarget({
          kind: "workflow",
          id: created.id,
          projectId,
          name,
          ownsProject: false
        });
      } catch (error) {
        reportEntryFailure("workflow", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      createWorkflow,
      noteUncarriedContext,
      flowPrompt,
      reportEntryFailure,
      starting,
      t
    ]
  );

  // Nothing is created until the build is green, so the flow's target names
  // the project and carries the description.
  const startAppFlow = useCallback(
    async (projectId: string) => {
      const text = flowPrompt.trim();
      noteUncarriedContext("app", { entities: false, references: false });
      applySetupTarget({
        kind: "app",
        id: crypto.randomUUID(),
        projectId,
        name: text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.app"),
        ownsProject: false,
        initialDescriptor: text
      });
    },
    [applySetupTarget, flowPrompt, noteUncarriedContext, t]
  );

  const startGameFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.game");
      setStarting(true);
      try {
        // A 2D game is designed first: the flow's document is a workflow row
        // carrying `settings.game`, the record the headless game tools share.
        if (gameDimension === "2d") {
          const setup = await createWorkflow({
            name,
            description: "",
            tags: [],
            access: "private",
            project_id: projectId,
            settings: writeGameSetup(
              {},
              { stage: "idea", brief: text, template: DEFAULT_NATIVE_GAME_TEMPLATE }
            )
          });
          noteUncarriedContext("game", {
            entities: false,
            references: false
          });
          applySetupTarget({
            kind: "game",
            id: setup.id,
            projectId,
            name,
            ownsProject: false
          });
          return;
        }
        const created = await trpcClient.games.create.mutate({
          projectId,
          name,
          dimension: "3d",
          document: createNative3DGame(newDocumentId())
        });
        noteUncarriedContext("game", {
          entities: false,
          references: false
        });
        if (!(await showDocumentProject(projectId, name))) return;
        openTab({
          type: "game",
          ref: created.game.id,
          mode: "edit",
          title: name,
          projectId
        });
        useOnboardingStore.getState().markStep("start-guided-flow");
        if (flowRef) closeTab(tabId("guided-flow", flowRef));
      } catch (error) {
        reportEntryFailure("game", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      closeTab,
      createWorkflow,
      flowRef,
      gameDimension,
      noteUncarriedContext,
      openTab,
      flowPrompt,
      reportEntryFailure,
      showDocumentProject,
      starting,
      t
    ]
  );

  const startEntityFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = flowPrompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : t("pass3_32.projects.home.documentNames.entity");
      setStarting(true);
      try {
        const references = await uploadComposerReferences(droppedFiles);
        const initialAssetId = assetIdFromLocator(
          references.find((reference) => reference.type.startsWith("image/"))
            ?.uri
        );
        noteUncarriedContext("entity", {
          entities: false,
          // The entity takes one reference image.
          references: initialAssetId !== undefined ? 1 : 0
        });
        const target: SetupTarget = {
          kind: "entity",
          id: projectId,
          projectId,
          name,
          ownsProject: false,
          initialDescriptor: text
        };
        if (initialAssetId) {
          target.initialAssetId = initialAssetId;
        }
        applySetupTarget(target);
      } catch (error) {
        reportEntryFailure("entity", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      droppedFiles,
      noteUncarriedContext,
      flowPrompt,
      reportEntryFailure,
      starting,
      t
    ]
  );

  const startSpeechFlow = useCallback(
    async (projectId: string) => {
      try {
        await openSpeechChat(projectId, flowPrompt.trim());
        noteUncarriedContext("chat", { entities: false, references: false });
        closeTab(
          tabId(flowRef ? "guided-flow" : "project-new", flowRef ?? PROJECT_NEW_REF)
        );
      } catch (error) {
        reportEntryFailure("chat", error);
      }
    },
    [closeTab, flowRef, flowPrompt, noteUncarriedContext, reportEntryFailure]
  );

  const runDestinationFlow = useCallback(
    (id: EntryFlowId) => {
      const starters: Record<
        EntryFlowId,
        (projectId: string) => Promise<void>
      > = {
        entity: startEntityFlow,
        storyboard: startStoryboardFlow,
        video: startVideoFlow,
        script: startScriptFlow,
        speech: startSpeechFlow,
        image: startImageProject,
        workflow: startWorkflowFlow,
        game: startGameFlow,
        app: startAppFlow
      };
      // Marked before the first await, so the card reads as busy on the click
      // rather than on the create's first render.
      setPendingFlow(id);
      void starters[id](creationProjectId()).finally(() => setPendingFlow(null));
    },
    [
      startAppFlow,
      startEntityFlow,
      startGameFlow,
      startImageProject,
      startScriptFlow,
      startSpeechFlow,
      startStoryboardFlow,
      startVideoFlow,
      startWorkflowFlow
    ]
  );

  const handleEntryCard = useCallback(
    (id: string) => {
      if (pendingFlow !== null || starting || isUploading) {
        return;
      }
      // Through the card list, so the id that reaches the starters is a known
      // flow and no cast is needed to say so.
      const card = ENTRY_CARDS.find((entry) => entry.id === id);
      if (!card) {
        return;
      }
      runDestinationFlow(card.id);
    },
    [isUploading, pendingFlow, runDestinationFlow, starting]
  );

  const handleMakeGame = useCallback(
    () => handleEntryCard("game"),
    [handleEntryCard]
  );

  const handleNewModel = async () => {
    if (
      starting ||
      pendingFlow !== null ||
      isUploading ||
      creating !== null ||
      modelCreationInFlight.current ||
      !modelEntry?.create
    ) {
      return;
    }
    modelCreationInFlight.current = true;
    setStarting(true);
    try {
      await modelEntry.create();
    } finally {
      modelCreationInFlight.current = false;
      setStarting(false);
    }
  };

  // The chosen card says what it is doing; the other cards are off, because a
  // second flow started over the first would create an unwanted draft.
  const entryOptions = useMemo<readonly OptionCardItem[]>(() => {
    const cards = ENTRY_CARDS.filter((card) =>
      showMoreFlows ||
      ["storyboard", "image", "speech", "workflow", "game", "app"].includes(
        card.id
      )
    ).map((card) => ({
      ...card,
      title: t(`pass3_32.projects.home.entryCards.${card.id}.title`),
      description: card.id === "game" && gameDimension === "3d"
        ? t("pass3_32.projects.home.entryCards.game.description3d")
        : t(`pass3_32.projects.home.entryCards.${card.id}.description`),
      image: ENTRY_BACKGROUNDS[card.id]
    }));
    if (pendingFlow === null) {
      if (starting) {
        return cards.map((card) => ({
          ...card,
          disabled: true,
          disabledReason: t("pass3_32.projects.home.disabled.documentOpening")
        }));
      }
      // A card started now would take only the references already uploaded.
      return isUploading
        ? cards.map((card) => ({
            ...card,
            disabled: true,
            disabledReason: t("pass3_32.projects.home.disabled.uploadingReferences")
          }))
        : cards;
    }
    return cards.map((card) =>
      card.id === pendingFlow
        ? {
            ...card,
            meta: t("pass3_32.projects.home.disabled.creatingMeta"),
            disabled: true,
            // Every card files a draft into the open project and makes none.
            disabledReason: t("pass3_32.projects.home.disabled.creatingDraft")
          }
        : {
            ...card,
            disabled: true,
            disabledReason: t("pass3_32.projects.home.disabled.flowStarting")
          }
    );
  }, [isUploading, pendingFlow, showMoreFlows, gameDimension, starting, t]);

  /**
   * The flow's last step wrote stage `done`: hand the finished board its own
   * tab and let this one go.
   *
   * The workflow flow is the one that returns a result — it builds, validates
   * and may test-run on its final action — and those failures are reported
   * here, because this tab is the last place that holds them.
   */
  const handleSetupFinished = useCallback(
    async (
      result?: BuildFromPlanResult | null,
      game?: BuildGameResult,
      app?: BuiltApp
    ) => {
      const target = setupTargetRef.current;
      if (!target || target.kind === "entity") {
        return;
      }
      // The App flow makes its app only when the build is green.
      if (target.kind === "app" && !app) {
        return;
      }
      // The Game flow's document is the workflow that carried the setup; the
      // tab it opens is the game the build made.
      if (target.kind === "game" && !game) {
        return;
      }
      // Every tab stays mounted, so a flow can finish (or load as finished)
      // while the creator works in another tab or project. Opening its
      // project then would pull them away, so the hand-off waits until this
      // tab is in view again.
      if (!guidedTabActiveRef.current) {
        setHeldFinish({ result, game, app });
        return;
      }
      if (!(await showDocumentProject(target.projectId, target.name))) {
        // The document is done, so the flow has no step left to show. The
        // hand-off is kept with a way to try it again.
        setHeldFinish({ result, game, app });
        setFinishError(
          t("pass3_32.projects.home.finishProjectOpenError", { kind: setupKindName(target.kind) })
        );
        return;
      }
      setFinishError(null);
      const failures = game
        ? gameBuildFailures(game, t)
        : result
          ? buildFailures(result, t)
          : [];
      if (failures.length > 0) {
        addNotification({
          type: "warning",
          alert: true,
          content: t("pass3_32.projects.home.openedWithBuildFailures", {
            kind: setupKindName(target.kind),
            failures: failures.join(" ")
          })
        });
      }
      openTab({
        type: SETUP_TAB_TYPE[target.kind],
        ref: game ? game.gameId : app ? app.appId : target.id,
        // A built app opens where it is used. In its editor the canvas showed
        // a static progress label and an empty alert, which study 8 read as a
        // run in progress and an error.
        mode: app ? "view" : "edit",
        title: game ? game.name : app ? app.name : target.name,
        projectId: target.projectId
      });
      if (game) {
        await discardGameSetupWorkflow(target.id);
      }
      if (failures.length === 0) {
        useOnboardingStore.getState().markStep("start-guided-flow");
      }
      applySetupTarget(null);
      if (flowRef) closeTab(tabId("guided-flow", flowRef));
    },
    [addNotification, applySetupTarget, closeTab, flowRef, openTab, showDocumentProject, setupKindName, t]
  );

  useEffect(() => {
    if (heldFinish && guidedTabActive && finishError === null) {
      setHeldFinish(null);
      void handleSetupFinished(
        heldFinish.result,
        heldFinish.game,
        heldFinish.app
      );
    }
  }, [finishError, guidedTabActive, handleSetupFinished, heldFinish]);

  const retryFinish = useCallback(() => {
    const held = heldFinish;
    setHeldFinish(null);
    setFinishError(null);
    void handleSetupFinished(held?.result, held?.game, held?.app);
  }, [handleSetupFinished, heldFinish]);

  const handleAppFinished = useCallback(
    (app: BuiltApp) => {
      void handleSetupFinished(null, undefined, app);
    },
    [handleSetupFinished]
  );

  const handleGameFinished = useCallback(
    (game: BuildGameResult) => {
      void handleSetupFinished(null, game);
    },
    [handleSetupFinished]
  );

  /**
   * A blank game from the Game flow's first step: the flow's workflow row is
   * dropped, and the game opens in the project the flow was filed under.
   */
  const startBlankGame = useCallback(
    async (kind: GameStartAlternative) => {
      const target = setupTargetRef.current;
      if (!target || target.kind !== "game") {
        return;
      }
      const dimension = kind === "blank-3d" ? "3d" : "2d";
      const created = await trpcClient.games.create.mutate({
        projectId: target.projectId,
        name: target.name,
        dimension,
        document:
          dimension === "3d"
            ? createNative3DGame(newDocumentId())
            : createTopDownRoomGame(newDocumentId())
      });
      await handleSetupFinished(null, {
        gameId: created.game.id,
        name: created.game.name || target.name,
        projectId: target.projectId,
        failures: []
      });
    },
    [handleSetupFinished]
  );

  const handleEntityFinished = useCallback(() => {
    useOnboardingStore.getState().markStep("start-guided-flow");
    applySetupTarget(null);
    openPageTab("entities");
    if (flowRef) closeTab(tabId("guided-flow", flowRef));
  }, [applySetupTarget, closeTab, flowRef]);

  /**
   * "Change flow" on step 1 — the shell asks first, this runs on confirm.
   *
   * Step 1 is cheap text (PRD § 6.2: nothing renders before step 3), so the
   * draft is worth nothing and is deleted rather than left behind. The project
   * row the card made goes with it — but only when the card made one: a flow
   * filed into the open project leaves that project where it is. The brief
   * the creator typed in step 1 comes back to the composer. A flow opened
   * from Home runs in its own tab, whose composer was empty, so the composer
   * is refilled from what the target recorded when the card was clicked (O6). Step 1 offers no way to
   * change references or entities, so that record is still what the flow holds.
   *
   * The host hands over the brief its own mounted document holds, before
   * anything is deleted. Reading it back from the server instead would race
   * the flows that persist on a debounce, and hand back the previous text (or
   * nothing) right after the deletion that made it unrecoverable. It is used
   * as given, empty included: a creator who cleared the field meant to.
   *
   * Errors are left to reject: the shell shows them on its own error line, and
   * the flow stays up rather than dropping the creator on a half-deleted draft.
   */
  const handleChangeFlow = useCallback(
    async (brief: string) => {
      const target = setupTargetRef.current;
      if (!target) {
        return;
      }
      await deleteSetupDocument(target);
      if (target.ownsProject) {
        await trpcClient.projects.delete.mutate({ id: target.projectId });
        if (flowRef) {
          openTab({
            type: "guided-flow",
            ref: flowRef,
            projectId: personalProjectId ?? LOOSE_PROJECT_ID
          });
          setActiveProjectId(personalProjectId);
        }
      }
      setPrompt(brief);
      const carried = target.carried;
      if (carried) {
        clearFiles();
        addDroppedFiles(
          carried.references.map((reference) => ({
            id: "",
            dataUri: reference.uri,
            type: reference.type,
            name: reference.name,
            assetUri: reference.uri
          }))
        );
        setEntityIds(carried.entityIds);
      }
      applySetupTarget(null);
    },
    [
      addDroppedFiles,
      applySetupTarget,
      clearFiles,
      flowRef,
      openTab,
      personalProjectId,
      setActiveProjectId
    ]
  );

  /**
   * "Start from an example" in the workflow flow (PRD § 11.1) — the browser is
   * inline in step 1, and this copies what was picked.
   *
   * The listed example carries an empty graph; the real one is materialized
   * server-side by `workflows.create` from its package and name, into a new
   * row. So the empty workflow the entry card made cannot be copied into and
   * is discarded here — nothing has been generated at step 1 (PRD § 6.2).
   *
   * The project row stays and takes the copy. The creator clicked an entry
   * card, which is a request for a project; the copy is what that project now
   * holds. The copy keeps the server-side project assignment and the tab group
   * association the entry card gave the placeholder.
   *
   * Returns the copy's id, which differs from the flow's own workflow: the
   * flow then writes no stage of its own and only finishes.
   */
  const startWorkflowFromExample = useCallback(
    async (example: Workflow): Promise<string | null> => {
      const placeholder = setupTargetRef.current;
      if (!placeholder || placeholder.kind !== "workflow") {
        return null;
      }
      const tags = example.tags ?? [];
      const copy = await createWorkflow(
        {
          name: example.name,
          description: example.description,
          package_name: example.package_name,
          tags: tags.includes("example") ? tags : [...tags, "example"],
          access: "private",
          project_id: placeholder.projectId
        },
        examplePackageName(example),
        exampleSeedRef(example)
      );
      // Pointed at the copy before the discard, so the finish that follows in
      // the same tick opens the example rather than the row about to go.
      applySetupTarget({
        kind: "workflow",
        id: copy.id,
        projectId: placeholder.projectId,
        name: copy.name || example.name,
        ownsProject: placeholder.ownsProject
      });
      // The copy is already this tab's target, so a failed discard must not
      // reject: the flow would stay up on a workflow with no setup and show
      // nothing. The copy opens, and the leftover row is named instead.
      try {
        await deleteSetupDocument(placeholder);
      } catch (error) {
        addNotification({
          type: "warning",
          alert: true,
          content: `The example opened, but the empty workflow "${placeholder.name}" could not be removed: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
      return copy.id;
    },
    [addNotification, applySetupTarget, createWorkflow]
  );

  /**
   * E2 § 8.1 "Start from a script": the brief goes to E3 and this tab becomes
   * the script flow, in the project the video card already made. The draft
   * sequence is discarded as Change flow discards it: it holds nothing yet,
   * and the script's `Send to timeline` makes a sequence of its own.
   */
  const startScriptFromVideo = useCallback(
    async (brief: string, creativeContext?: CreativeContext) => {
      const target = setupTargetRef.current;
      if (!target || starting) {
        return;
      }
      const text = brief.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : target.name;
      setStarting(true);
      try {
        // The references and entities the video card took come along, as
        // they would had the Script card been picked from the composer.
        const script = await createScript.mutateAsync({
          name,
          projectId: target.projectId,
          document: newScriptSetupDocument(text, {
            attachments: (target.carried?.references ?? []).map(
              ({ uri, name: fileName, type }) => ({
                uri,
                name: fileName,
                contentType: type
              })
            ),
            entityIds: target.carried?.entityIds ?? [],
            creativeContext
          })
        });
        applySetupTarget({
          kind: "script",
          id: script.id,
          projectId: target.projectId,
          name,
          ownsProject: target.ownsProject
        });
        // The script is up either way; a draft that will not go only costs an
        // empty row, so it is not worth an error.
        await deleteSetupDocument(target).catch(() => undefined);
      } catch (error) {
        reportEntryFailure("script", error);
      } finally {
        setStarting(false);
      }
    },
    [applySetupTarget, createScript, reportEntryFailure, starting]
  );

  // A start that was parked on provider onboarding resumes on its own once a
  // provider is connected, so the user finishes the thing they asked for. The
  // dialog has done its job then: left open, it covered the model menu the
  // resumed start opens and then the chat that start opened.
  const resumeProject = useRef(handleStart);
  resumeProject.current = handleStart;
  useEffect(() => {
    if (!pendingStart || !hasConfiguredProvider) {
      return;
    }
    setPendingStart(false);
    useProviderOnboardingStore.getState().dismiss();
    void resumeProject.current();
  }, [pendingStart, hasConfiguredProvider]);

  useEffect(() => {
    if (!pendingModelStart || !isModelSelected(selectedModel)) {
      return;
    }
    setPendingModelStart(false);
    removeNotificationsByKey(PICK_MODEL_NOTICE_KEY);
    void resumeProject.current();
  }, [pendingModelStart, selectedModel, removeNotificationsByKey]);

  // The handler rides the field wrapper, where MUI puts unknown props, and the
  // keydown reaches it by bubbling from the textarea. Both pickers only read
  // `key` and call `preventDefault`, so the retype is safe. Enter keeps its
  // newline — a project brief runs to more than one line — and Ctrl/⌘+Enter
  // starts, the way a multi-line composer submits everywhere else.
  const sendShortcutLabel = useMemo(
    () => (isMac() ? "⌘ Enter" : "Ctrl Enter"),
    []
  );

  const handlePromptKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keyEvent =
        event as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
      if (handleSkillKeyDown(keyEvent)) {
        return;
      }
      if (handleMentionKeyDown(keyEvent)) {
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleStart();
      }
    },
    [handleMentionKeyDown, handleSkillKeyDown, handleStart]
  );

  const handleConnectProvider = useCallback(() => {
    openProviderOnboarding();
  }, []);

  const handleOpenExamples = useCallback(() => {
    openPageTab("examples");
  }, []);

  // The checklist pill for guided flows: the cards live further down this
  // surface, so the pill scrolls to them instead of starting one itself.
  const handleStartGuidedFlow = useCallback(() => {
    document
      .getElementById("guided-flows")
      // Optional call: jsdom (and any non-visual host) has no scrolling.
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, []);

  // The checklist pill focuses the composer for the next chat turn.
  const handleDescribeIdea = useCallback(() => {
    const element = promptRef.current;
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    element?.focus();
  }, []);

  const handleOpenTutorials = useCallback(() => {
    openPageTab("tutorials");
  }, []);

  // The flow's last button unmounts with the flow, so focus would drop to the
  // page. It goes to the control that retries the hand-off, unless the creator
  // has already put it somewhere else.
  const retryFinishRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (finishError === null) {
      return;
    }
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      retryFinishRef.current?.focus();
    }
  }, [finishError]);

  if (setupTarget && finishError) {
    return (
      <FlexColumn gap={SPACING.md} sx={{ p: SPACING.xl, maxWidth: COLUMN_WIDTH }}>
        <AlertBanner
          severity="error"
          title={t("pass3_32.projects.home.openFailureTitle")}
          action={
            <ReportBugButton
              label={t("pass3_32.projects.home.reportFailure")}
              variant="outlined"
              size="small"
              context={{
                source: "manual",
                summary: t("pass3_32.projects.home.guidedFlowOpenFailure", { kind: setupKindName(setupTarget.kind) }),
                errorText: finishError
              }}
            />
          }
        >
          {finishError}
        </AlertBanner>
        <EditorButton
          ref={retryFinishRef}
          variant="contained"
          onClick={retryFinish}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("pass3_32.projects.home.openDocument", { kind: setupKindName(setupTarget.kind) })}
        </EditorButton>
      </FlexColumn>
    );
  }

  // An entry card was clicked: this tab is the flow now (PRD § 6.1).
  if (setupTarget) {
    if (setupTarget.kind === "entity") {
      if (setupTarget.initialAssetId) {
        return (
          <EntitySetupHost
            projectId={setupTarget.projectId}
            draftKey={flowRef}
            initialDescriptor={setupTarget.initialDescriptor ?? flowPrompt.trim()}
            initialAssetId={setupTarget.initialAssetId}
            onFinish={handleEntityFinished}
            onChangeFlow={handleChangeFlow}
          />
        );
      }
      return (
        <EntitySetupHost
          projectId={setupTarget.projectId}
          draftKey={flowRef}
          initialDescriptor={setupTarget.initialDescriptor ?? flowPrompt.trim()}
          onFinish={handleEntityFinished}
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    if (setupTarget.kind === "video") {
      return (
        <VideoSetupHost
          sequenceId={setupTarget.id}
          active={active}
          onFinish={handleSetupFinished}
          onStartFromScript={(brief, creativeContext) =>
            void startScriptFromVideo(brief, creativeContext)
          }
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    if (setupTarget.kind === "script") {
      return (
        <ScriptSetupHost
          scriptId={setupTarget.id}
          onFinish={handleSetupFinished}
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    if (setupTarget.kind === "game") {
      return (
        <GameSetupHost
          workflowId={setupTarget.id}
          projectId={setupTarget.projectId}
          onStartAlternative={startBlankGame}
          onFinish={handleGameFinished}
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    if (setupTarget.kind === "app") {
      return (
        <AppSetupHost
          projectId={setupTarget.projectId}
          draftKey={flowRef}
          initialBrief={setupTarget.initialDescriptor ?? flowPrompt.trim()}
          onFinish={handleAppFinished}
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    if (setupTarget.kind === "workflow") {
      return (
        <WorkflowSetupHost
          workflowId={setupTarget.id}
          onStartFromExample={startWorkflowFromExample}
          onFinish={handleSetupFinished}
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    return (
      <StoryboardSetupHost
        boardId={setupTarget.id}
        onFinish={handleSetupFinished}
        onChangeFlow={handleChangeFlow}
      />
    );
  }

  // One project's work: its documents, then its latest chats, both scoped by
  // the project picker in the documents header.
  const noDocuments = projectDocumentTotal === 0;
  const projectWork = (
    <FlexColumn gap={SPACING.xl}>
      <CurrentProjectDocuments />
      <RecentChats />
    </FlexColumn>
  );

  return (
    <ScrollArea fullHeight>
      <FlexColumn
        align="center"
        sx={{ minHeight: "100%", px: { xs: SPACING.lg, sm: SPACING.xl } }}
      >
        <FlexColumn
          sx={{
            width: "100%",
            maxWidth: `${COLUMN_WIDTH}px`,
            gap: { xs: SPACING.xxl, sm: SPACING.xxxl },
            pt: SPACING.xl
          }}
        >
          {/* The getting-started steps read as a thin bar above the page rather
              than a block wedged between the composer and the footer. */}
          {showOnboarding && (
            <GettingStartedChecklist
              hasConfiguredProvider={hasConfiguredProvider}
              onConnectProvider={handleConnectProvider}
              onStartGuidedFlow={handleStartGuidedFlow}
              onDescribeIdea={handleDescribeIdea}
              onOpenExamples={handleOpenExamples}
            />
          )}

          {/* The prompt's `/` and `@` menus open downward when
              the field is too near the top of the viewport for them to fit
              above it (`mentionMenuPosition`). */}
          <FlexColumn
            component="section"
            aria-label={t("pass3_32.projects.home.describeRegion")}
            gap={SPACING.lg}
            sx={{ pt: showOnboarding ? 0 : SPACING.xxl }}
          >
            <FlexColumn gap={SPACING.sm} align="center">
              <Text size="giant" component="h1" sx={{ textAlign: "center" }}>
                {t("pass3_32.projects.home.heading")}
              </Text>
              <Text
                color="secondary"
                sx={{ maxWidth: INTRO_TEXT_WIDTH, textAlign: "center" }}
              >
                {t("pass3_32.projects.home.intro")}
              </Text>
            </FlexColumn>

            <FlexRow
              role="group"
              aria-label={t("pass3_32.projects.home.quickCreateGroup")}
              justify="center"
              gap={SPACING.md}
              wrap
            >
              <EditorButton
                variant="outlined"
                size="medium"
                startIcon={<Box component="span" aria-hidden>{TYPE_GLYPH.game}</Box>}
                disabled={
                  starting || pendingFlow !== null || isUploading || creating !== null
                }
                disabledReason={t("pass3_32.projects.home.disabled.waitForCurrentWork")}
                onClick={handleMakeGame}
              >
                {t("pass3_32.projects.home.game")}
              </EditorButton>
              <EditorButton
                variant="outlined"
                size="medium"
                startIcon={<Box component="span" aria-hidden>{TYPE_GLYPH.model3d}</Box>}
                tooltip={t("pass3_32.projects.home.newModelTooltip")}
                disabled={
                  starting || pendingFlow !== null || isUploading || creating !== null
                }
                disabledReason={t("pass3_32.projects.home.disabled.waitForCurrentWork")}
                onClick={() => void handleNewModel()}
              >
                {t("pass3_32.projects.home.newModel")}
              </EditorButton>
            </FlexRow>

            <FlexColumn
              sx={{
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: BORDER_RADIUS.xl,
                transition: MOTION.border,
                ...reducedMotion({ transition: MOTION.none }),
                "&:hover": { borderColor: "action.active" },
                "&:focus-within": { borderColor: "primary.main" }
              }}
            >
              <TextInput
                value={prompt}
                autoFocus
                multiline
                minRows={3}
                maxRows={12}
                variant="standard"
                label={t("pass3_32.projects.home.chatPromptLabel")}
                hideLabel
                inputRef={promptRef}
                placeholder={t("pass3_32.projects.home.promptPlaceholder")}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ px: SPACING.xl, pt: SPACING.lg }}
              />
              {mentionMenu}
              {skillMenu}

              {droppedFiles.length > 0 && (
                <FlexRow gap={SPACING.md} wrap sx={{ px: SPACING.xl }}>
                  {droppedFiles.map((file) =>
                    // A text file or a document has no picture to show, so
                    // it reads as its name rather than a broken thumbnail.
                    !file.type.startsWith("image/") ? (
                      <Chip
                        key={file.id}
                        icon={<InsertDriveFileOutlinedIcon />}
                        label={file.name}
                        onDelete={() => removeFile(file.id)}
                      />
                    ) : (
                    <Box key={file.id} sx={{ position: "relative" }}>
                      <ResponsiveImage
                        locator={file.dataUri}
                        alt={file.name}
                        fit="cover"
                        borderRadius={BORDER_RADIUS.sm}
                        showErrorFallback
                        sx={{ width: REFERENCE_THUMB_SIZE, height: REFERENCE_THUMB_SIZE }}
                      />
                      <CloseButton
                        onClick={() => removeFile(file.id)}
                        tooltip={t("pass3_32.projects.home.removeReference", { name: file.name })}
                        buttonSize="small"
                        iconVariant="clear"
                        sx={{
                          position: "absolute",
                          top: -SPACING_PX.xs,
                          right: -SPACING_PX.xs
                        }}
                      />
                    </Box>
                    )
                  )}
                </FlexRow>
              )}

              {/* The context a turn carries sits quietly on the left; the one
                  primary action is the send on the right. */}
              <FlexRow
                align="center"
                gap={SPACING.xs}
                wrap
                sx={{ px: SPACING.md, pt: SPACING.md, pb: SPACING.md }}
              >
                <EditorButton
                  variant="text"
                  color="inherit"
                  density="normal"
                  startIcon={<AddPhotoAlternateOutlinedIcon />}
                  onClick={() => refInputRef.current?.click()}
                  sx={composerToolSx}
                >
                  {referenceImageCount === 0
                    ? t("pass3_32.projects.home.referenceImages")
                    : t("pass3_32.projects.home.referenceImageCountShort", { count: referenceImageCount })}
                </EditorButton>
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label={t("pass3_32.projects.home.referenceImages")}
                  onChange={handleRefImages}
                  style={{ display: "none" }}
                />
                <EditorButton
                  variant="text"
                  color="inherit"
                  density="normal"
                  startIcon={<PeopleAltOutlinedIcon />}
                  onClick={() => setEntityPickerOpen(true)}
                  sx={composerToolSx}
                >
                  {selectedEntities.length === 0
                    ? t("pass3_32.projects.home.entitiesNone")
                    : t("pass3_32.projects.home.entitiesSelected", {
                        entities: selectedEntities.map((entity) => entity.name).join(", ")
                      })}
                </EditorButton>
                <EditorButton
                  ref={modelButtonRef}
                  variant="text"
                  color="inherit"
                  density="normal"
                  startIcon={<AutoAwesomeOutlinedIcon />}
                  onClick={(event) => setModelAnchor(event.currentTarget)}
                  sx={composerToolSx}
                >
                  {isModelSelected(selectedModel)
                    ? t("pass3_32.projects.home.selectedModel", {
                        name: selectedModel?.name || selectedModel?.id
                      })
                    : t("pass3_32.projects.home.selectModel")}
                </EditorButton>
                <Box sx={{ flex: 1 }} />
                {estimate && (
                  <Box
                    component="span"
                    sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}
                  >
                    {formatEstimate(estimate)}
                  </Box>
                )}
                <Caption
                  color="muted"
                  aria-hidden
                  sx={{ display: { xs: "none", sm: "block" }, px: SPACING.sm }}
                >
                  {sendShortcutLabel}
                </Caption>
                <EditorButton
                  variant="contained"
                  color="primary"
                  density="normal"
                  endIcon={<ArrowUpwardIcon />}
                  disabled={
                    prompt.trim().length === 0 || starting || isUploading
                  }
                  onClick={() => void handleStart()}
                  sx={{ borderRadius: BORDER_RADIUS.pill }}
                >
                  {t("pass3_32.projects.home.sendToChat")}
                </EditorButton>
              </FlexRow>
            </FlexColumn>

            {starters.length > 0 && (
              <FlexColumn gap={SPACING.md} align="center">
                <FlexRow
                  justify="center"
                  gap={SPACING.sm}
                  wrap
                  role="group"
                  aria-label={t("pass3_32.projects.home.startFromSkill")}
                >
                  {visibleStarters.map((entry) => {
                    const active = entry.name === starter?.name;
                    return (
                      <Tooltip
                        key={entry.name}
                        title={entry.description}
                        placement="bottom"
                        // Described by, not named by: the pill's name stays
                        // the skill's label.
                        describeChild
                      >
                        <Chip
                          compact
                          label={starterLabel(entry.name)}
                          active={active}
                          // The picked starter is drawn in the project colour.
                          accent={active ? PROJECT_COLOR : undefined}
                          onClick={() => handleToggleStarter(entry.name)}
                        />
                      </Tooltip>
                    );
                  })}
                  {(hiddenStarterCount > 0 || showAllStarters) && (
                    <Chip
                      compact
                      aria-expanded={showAllStarters}
                      label={
                        showAllStarters
                          ? t("pass3_32.projects.home.showFewer")
                          : t("pass3_32.projects.home.moreStarters", { count: hiddenStarterCount })
                      }
                      onClick={() => setShowAllStarters((shown) => !shown)}
                      sx={{ borderStyle: "dashed" }}
                    />
                  )}
                </FlexRow>
                {starter ? (
                  <Caption
                    color="secondary"
                    sx={{ maxWidth: INTRO_TEXT_WIDTH, textAlign: "center" }}
                  >
                    {starter.description}
                  </Caption>
                ) : (
                  <Caption color="muted">
                    {t("pass3_32.projects.home.pickSkillOrDescribe")}
                  </Caption>
                )}
              </FlexColumn>
            )}
          </FlexColumn>

          {!noDocuments && projectWork}

          <FlexColumn
            component="section"
            id="guided-flows"
            aria-label={t("pass3_32.projects.home.guidedFlowsRegion")}
            gap={SPACING.lg}
            // Only the flow cards sit on black. The section's other buttons
            // (More formats, the game dimension select, a card's expand
            // control) keep their own surfaces.
            sx={{
              [`& .${OPTION_CARD_CLASS}`]: { bgcolor: "common.black" },
              [`& .${OPTION_CARD_CLASS}:not([aria-disabled="true"]):hover`]: {
                bgcolor: "common.black",
                borderColor: "primary.main"
              },
              [`& .${OPTION_CARD_CLASS} img`]: {
                opacity: 0.7,
                transition: MOTION.opacity,
                ...reducedMotion({ transition: MOTION.none })
              },
              [`& .${OPTION_CARD_CLASS}:not([aria-disabled="true"]):hover img`]:
                {
                  opacity: 0.9
                }
            }}
          >
            <FlexRow align="flex-end" gap={SPACING.md} wrap>
              <FlexColumn gap={SPACING.xs} sx={{ flex: 1, minWidth: 0 }}>
                <Text size="big" component="h2">
                  {t("pass3_32.projects.home.guidedFlowsHeading")}
                </Text>
                <Caption color="secondary">
                  {t("pass3_32.projects.home.guidedFlowsDescription")}
                </Caption>
              </FlexColumn>
              {showMoreFlows && <FlexRow align="center" gap={SPACING.sm}>
                <Caption color="muted">{t("pass3_32.projects.home.gameStartsAs")}</Caption>
                <InspectorSelect
                  label={t("pass3_32.projects.home.gameDimension")}
                  value={gameDimension}
                  options={[
                    { value: "2d", label: t("pass3_32.projects.home.game2d") },
                    { value: "3d", label: t("pass3_32.projects.home.game3d") }
                  ]}
                  onChange={(value) => {
                    if (value === "2d" || value === "3d") {
                      setGameDimension(value);
                    }
                  }}
                />
              </FlexRow>}
            </FlexRow>
            <OptionCardGrid
              label={t("pass3_32.projects.home.guidedFlowsRegion")}
              options={entryOptions}
              onSelect={handleEntryCard}
              minColumnWidth={190}
              variant="media"
              // These cards route to a flow, they do not pick one of a set:
              // no pressed state, and each is its own tab stop.
              mode="navigation"
            />
            <EditorButton
              aria-expanded={showMoreFlows}
              onClick={() => setShowMoreFlows((shown) => !shown)}
            >
              {showMoreFlows ? t("pass3_32.projects.home.fewerFormats") : t("pass3_32.projects.home.moreFormats")}
            </EditorButton>
          </FlexColumn>

          {/* A project with no documents has nothing to resume, so the flow
              cards come first and stay on the first screen. */}
          {noDocuments && projectWork}

          {/* Examples come after the flows: they are a place to browse, not
              the first thing to do. */}
          <StartExamples
            onBrowseAll={handleOpenExamples}
            onMakeGame={handleMakeGame}
          />
        </FlexColumn>

        <Box sx={{ flex: 1, minHeight: SPACING.xxxl }} />

        {/* One quiet footer: the blank documents and the two places to go when
            nothing above fits, rather than two rows competing for the same
            "where else can I start" question. */}
        <FlexColumn
          gap={SPACING.md}
          sx={{
            width: "100%",
            maxWidth: `${COLUMN_WIDTH}px`,
            pt: SPACING.xxl,
            pb: SPACING.xxl
          }}
        >
          <Divider />
          <FlexRow align="baseline" gap={SPACING.md} wrap>
            <Caption
              color="muted"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              {t("pass3_32.projects.home.blankDocument")}
            </Caption>
            <Caption color="muted">
              {t("pass3_32.projects.home.blankDocumentDescription")}
            </Caption>
            <Box sx={{ flex: 1 }} />
            <EditorButton
              variant="text"
              density="compact"
              onClick={handleOpenExamples}
            >
              {t("pass3_32.projects.home.browseExamples")}
            </EditorButton>
            <EditorButton
              variant="text"
              density="compact"
              onClick={handleOpenTutorials}
            >
              {t("pass3_32.projects.home.tutorials")}
            </EditorButton>
          </FlexRow>
          <Box
            sx={{
              display: "grid",
              gap: SPACING.sm,
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                sm: "repeat(3, minmax(0, 1fr))",
                md: "repeat(6, minmax(0, 1fr))"
              }
            }}
          >
            {entries.map((entry) => (
              <EditorButton
                key={entry.key}
                type="button"
                variant="text"
                disabled={creating !== null || starting || pendingFlow !== null}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  if (entry.submenu) {
                    setSubmenu({
                      kind: entry.submenu,
                      element: event.currentTarget
                    });
                    return;
                  }
                  void entry.create?.();
                }}
                sx={{
                  justifyContent: "flex-start",
                  gap: (theme) => theme.spacing(SPACING.md),
                  height: CONTROL.height.md,
                  px: SPACING.md,
                  cursor: "pointer",
                  border: "none",
                  bgcolor: "transparent",
                  borderRadius: BORDER_RADIUS.md,
                  color: "text.primary",
                  "&:hover": { bgcolor: "action.hover" }
                }}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{ color: TYPE_COLOR[entry.type] }}
                >
                  {TYPE_GLYPH[entry.type]}
                </Box>
                <Label>
                {entry.submenu
                  ? `${t(`pass3_32.projects.home.blankEntries.${entry.key}`)} ▸`
                  : t(`pass3_32.projects.home.blankEntries.${entry.key}`)}
                </Label>
              </EditorButton>
            ))}
          </Box>
        </FlexColumn>
      </FlexColumn>

      <EntityPickerDialog
        open={entityPickerOpen}
        onClose={() => setEntityPickerOpen(false)}
        onSelect={toggleEntity}
        title={t("pass3_32.projects.home.entitiesDialogTitle")}
        multiple
        selectedIds={entityIds}
        entities={entities}
      />

      <LanguageModelMenuDialog
        open={modelAnchor !== null}
        anchorEl={modelAnchor}
        onClose={() => {
          setModelAnchor(null);
          setPendingModelStart(false);
        }}
        onModelChange={(model) => {
          setSelectedModel(model);
          setModelAnchor(null);
        }}
        selectedModel={
          isModelSelected(selectedModel) ? selectedModel : undefined
        }
        requireToolSupport
      />

      <ContextMenu
        open={submenu !== null}
        anchorEl={submenu?.element ?? null}
        onClose={() => setSubmenu(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        maxHeight="50vh"
        paperSx={{ width: SUBMENU_WIDTH, maxWidth: SUBMENU_MAX_WIDTH }}
      >
        {submenu?.kind === "texts" &&
          TEXT_FILE_TEMPLATES.map((template) => (
            <MenuItemPrimitive
              key={template.filename}
              label={t(`pass3_32.projects.home.textTemplates.${template.filename.slice(template.filename.lastIndexOf(".") + 1)}`)}
              disabled={creating !== null}
              onClick={() => {
                void createTextFile(template);
              }}
            />
          ))}
        {submenu?.kind === "storyboards" && (
          <MenuItemPrimitive
            label={t("pass3_32.projects.home.blankStoryboard")}
            dividerAfter
            disabled={creating !== null}
            onClick={() => {
              void createBlankStoryboard();
            }}
          />
        )}
        {submenu?.kind === "storyboards" &&
          !examplesLoading &&
          (exampleData ?? []).map((example) => (
            <MenuItemPrimitive
              key={example.slug}
              label={example.name}
              secondary={t("pass3_32.projects.home.renderedExampleShots", { count: example.shotCount })}
              disabled={creating !== null}
              onClick={() => {
                void installStoryboardExample(example.slug, example.name);
              }}
            />
          ))}
      </ContextMenu>
    </ScrollArea>
  );
};

export default NewProjectSurface;
