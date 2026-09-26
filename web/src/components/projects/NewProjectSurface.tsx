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
import {
  isModelSelected,
  type Entity,
  type ProductionReferenceBinding
} from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Chip,
  CloseButton,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  MenuItemPrimitive,
  Popover,
  ResponsiveImage,
  ScrollArea,
  SPACING,
  SPACING_PX,
  Text,
  TextInput,
  Tooltip,
  TYPOGRAPHY
} from "../ui_primitives";
import type { Asset, MessageContent, Workflow } from "../../stores/ApiTypes";
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
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import useOnboardingStore, {
  isOnboardingFinished
} from "../../stores/OnboardingStore";
import GettingStartedChecklist from "../onboarding/GettingStartedChecklist";
import DashboardExampleApps from "../portal/DashboardExampleApps";
import CurrentProjectDocuments from "./CurrentProjectDocuments";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import { openPageTab } from "../workspace/openPageTab";
import { OptionCardGrid, type OptionCardItem } from "../setup/OptionCardGrid";
import { ENTRY_CARDS, type EntryFlowId } from "../setup/entryCards";
import StoryboardSetupHost from "../setup/storyboard/StoryboardSetupHost";
import VideoSetupHost from "../setup/video/VideoSetupHost";
import ScriptSetupHost from "../setup/script/ScriptSetupHost";
import WorkflowSetupHost from "../setup/workflow/WorkflowSetupHost";
import EntitySetupHost from "../setup/entity/EntitySetupHost";
import { newVideoSetupDocument } from "../setup/video/useVideoSetupFlow";
import { newScriptSetupDocument } from "../setup/script/useScriptSetupFlow";
import { startImageFlow } from "../setup/image/startImageFlow";
import {
  useCreateTimeline,
  useSeedTimelineDetail
} from "../../hooks/useTimelineSequence";
import { useCreateScript } from "../../hooks/script/useScripts";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { trpcClient } from "../../trpc/client";
import { writeWorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { newDocumentId } from "../../lib/newDocumentId";
import { newStoryboardSetupDocument } from "../setup/storyboard/useStoryboardSetupFlow";
import { stageChatTurn } from "../chat/pendingChatTurn";
import { PROJECT_COLOR } from "./projectIdentity";
import {
  composeFirstTurn,
  estimateFromHistory,
  formatEstimate,
  invokedStarter,
  projectNameFromPrompt,
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

const ENTRY_BACKGROUNDS: Record<EntryFlowId, string> = {
  entity: imageBackground,
  storyboard: storyboardBackground,
  video: videoBackground,
  script: scriptBackground,
  image: imageBackground,
  workflow: workflowBackground,
  game: gameBackground
};

/** Width of the centered column, per the new-project mockup. */
const COLUMN_WIDTH = 860;

/** A starter pill at rest: outlined, quiet, the project's colour on hover. */
const starterPillSx = {
  borderRadius: BORDER_RADIUS.pill,
  color: "text.secondary",
  "&:hover": { borderColor: PROJECT_COLOR, color: "text.primary" }
} as const;

/** The picked starter: drawn in the project colour on a tint of it. */
const activeStarterPillSx = {
  color: PROJECT_COLOR,
  borderColor: PROJECT_COLOR,
  backgroundColor: "rgba(var(--palette-info-lightChannel) / 0.12)",
  "&:hover": { backgroundColor: "rgba(var(--palette-info-lightChannel) / 0.2)" }
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

const SETUP_TARGET_STORAGE_KEY = "nodetool-guided-setup-target";
const SETUP_TARGET_KINDS: ReadonlySet<string> = new Set([
  "entity",
  "storyboard",
  "video",
  "script",
  "workflow",
  "game"
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
        typeof value["initialAssetId"] !== "string")
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
  game: "game"
} as const;

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
  if (target.kind === "entity") {
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
const buildFailures = (result: BuildFromPlanResult): string[] => {
  const lines: string[] = [];
  if (result.issues.length > 0) {
    lines.push(
      `${result.issues.length} connection${
        result.issues.length === 1 ? "" : "s"
      } could not be wired.`
    );
  }
  if (result.validationErrors.length > 0) {
    lines.push(
      `The graph did not validate: ${result.validationErrors.join("; ")}`
    );
  }
  const run = result.testRun;
  if (run.error) {
    lines.push(`The run was refused: ${run.error}`);
  }
  return lines;
};

interface NewProjectSurfaceProps {
  flowRef?: string;
  initialSetupTarget?: SetupTarget | null;
}

const NewProjectSurface = ({
  flowRef,
  initialSetupTarget
}: NewProjectSurfaceProps) => {
  const [prompt, setPrompt] = useState("");
  // The starter row folds past `VISIBLE_STARTERS` until asked to show the rest.
  const [showAllStarters, setShowAllStarters] = useState(false);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [entityAnchor, setEntityAnchor] = useState<HTMLElement | null>(null);
  const [submenu, setSubmenu] = useState<SubmenuAnchor | null>(null);
  const [starting, setStarting] = useState(false);
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
  // The flow can swap its own target and finish in the same tick — the example
  // route replaces the placeholder workflow with the copy, then finishes — so
  // the handlers read this rather than the render's copy of the state.
  const setupTargetRef = useRef<SetupTarget | null>(setupTarget);
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
    getFileContents
  } = useFileHandling();
  const { uploadFiles, isUploading } = useComposerAssetUpload(addDroppedFiles);
  const { data: entities } = useEntities();
  // Both the user's own skills and the ones NodeTool ships: either is a
  // starter, and either is invoked the same way.
  const { data: skills } = useSkills({ includeSystem: true });
  const summaries = useProjectSummaries();
  const createStoryboard = useCreateStoryboard();
  const createTimeline = useCreateTimeline();
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
  const { data: exampleData, isLoading: examplesLoading } =
    useExampleStoryboards(submenu?.kind === "storyboards");

  const selectedEntities = useMemo(
    () => (entities ?? []).filter((entity) => entityIds.includes(entity.id)),
    [entities, entityIds]
  );

  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );

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
      if (files.length > 0) {
        uploadFiles(files);
      }
      // Clear the input so picking the same file twice still registers.
      event.target.value = "";
    },
    [uploadFiles]
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
        content: "Still checking your language models. Try again in a moment."
      });
      return;
    }
    if (!hasConfiguredProvider) {
      setPendingStart(true);
      openProviderOnboarding({
        capability: "generate_message",
        reason: "Almost there — chat needs a model to run."
      });
      return;
    }
    // A configured provider is not a picked model: the chat's model selection
    // starts on the "empty" sentinel, and a send with it never leaves the
    // client. Open this surface's own model menu rather than point at a
    // composer that is not on this screen.
    if (!isModelSelected(selectedModel)) {
      setModelAnchor(modelButtonRef.current);
      addNotification({
        type: "error",
        alert: true,
        content:
          "No model selected. Pick a language model here before opening chat."
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
            entityNames: selectedEntities.map((entity) => entity.name)
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
        title: "New chat",
        projectId
      });
      useOnboardingStore.getState().markStep("describe-idea");
      closeTab(
        tabId(flowRef ? "guided-flow" : "project-new", flowRef ?? PROJECT_NEW_REF)
      );
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not open chat: ${
          error instanceof Error ? error.message : String(error)
        }`
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
    selectedEntities,
    selectedModel,
    starter,
    starting
  ]);

  // A new flow gets its own tab. Changes within that flow keep the same tab.
  const applySetupTarget = useCallback((target: SetupTarget | null) => {
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
          title: "Home"
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
    if (target) {
      useOnboardingStore.getState().markStep("start-guided-flow");
    }
  }, [flowRef, hasHomeTab, openTab, setActiveTab, setGuidedFlowTarget]);

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
        content: `Could not start the ${flow}: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    },
    [addNotification]
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
    (flow: string, carries: { entities: boolean; references: boolean }) => {
      const left: string[] = [];
      if (!carries.references && droppedFiles.length > 0) {
        left.push(
          `${droppedFiles.length} reference ${
            droppedFiles.length === 1 ? "image" : "images"
          }`
        );
      }
      if (!carries.entities && selectedEntities.length > 0) {
        left.push(
          selectedEntities.length === 1
            ? `the entity ${selectedEntities[0].name}`
            : `${selectedEntities.length} entities`
        );
      }
      if (left.length === 0) {
        return;
      }
      addNotification({
        type: "info",
        alert: true,
        content: `The ${flow} flow starts from your prompt, so ${left.join(
          " and "
        )} stay on this screen. Add them from the flow's own step.`
      });
    },
    [addNotification, droppedFiles, selectedEntities]
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
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New storyboard";
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
      prompt,
      reportEntryFailure,
      starting
    ]
  );

  // The Video card. `timeline.create` takes no document, so the setup goes in
  // as one PATCH straight after — the flow reads it off the loaded sequence.
  const startVideoFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New video";
      setStarting(true);
      try {
        const references = await uploadComposerReferences(droppedFiles);
        const sequence = await createTimeline.mutateAsync({
          name,
          projectId
        });
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
        reportEntryFailure("video", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      createTimeline,
      droppedFiles,
      entityIds,
      noteUncarriedContext,
      prompt,
      reportEntryFailure,
      seedTimelineDetail,
      selectedEntities,
      starting
    ]
  );

  const startScriptFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New script";
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
      prompt,
      reportEntryFailure,
      starting
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
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New image";
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
        noteUncarriedContext("image", { entities: true, references: true });
        if (!(await showDocumentProject(projectId, name))) {
          return;
        }
        if (!hasHomeTab) {
          openTab({
            type: "project-new",
            ref: PROJECT_NEW_REF,
            mode: "view",
            title: "Home"
          });
        }
        openTab({
          type: "sketch",
          ref: started.documentId,
          mode: "edit",
          title: name,
          projectId
        });
        useOnboardingStore.getState().markStep("start-guided-flow");
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
      prompt,
      reportEntryFailure,
      showDocumentProject,
      starting
    ]
  );

  const startWorkflowFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New workflow";
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
      prompt,
      reportEntryFailure,
      starting
    ]
  );

  const startGameFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New game";
      setStarting(true);
      try {
        const created = await trpcClient.games.create.mutate({
          projectId,
          name,
          document: createTopDownRoomGame(newDocumentId())
        });
        noteUncarriedContext("game", {
          entities: false,
          references: false
        });
        if (!(await showDocumentProject(projectId, name))) return;
        openTab({
          type: "game",
          ref: created.game.id,
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
      closeTab,
      flowRef,
      noteUncarriedContext,
      openTab,
      prompt,
      reportEntryFailure,
      showDocumentProject,
      starting
    ]
  );

  const startEntityFlow = useCallback(
    async (projectId: string) => {
      if (starting) {
        return;
      }
      const text = prompt.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : "New entity";
      setStarting(true);
      try {
        const references = await uploadComposerReferences(droppedFiles);
        const initialAssetId = assetIdFromLocator(
          references.find((reference) => reference.type.startsWith("image/"))
            ?.uri
        );
        noteUncarriedContext("entity", {
          entities: false,
          references: initialAssetId !== undefined
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
        reportEntryFailure("entity flow", error);
      } finally {
        setStarting(false);
      }
    },
    [
      applySetupTarget,
      droppedFiles,
      noteUncarriedContext,
      prompt,
      reportEntryFailure,
      starting
    ]
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
        image: startImageProject,
        workflow: startWorkflowFlow,
        game: startGameFlow
      };
      // Marked before the first await, so the card reads as busy on the click
      // rather than on the create's first render.
      setPendingFlow(id);
      void starters[id](creationProjectId()).finally(() => setPendingFlow(null));
    },
    [
      startEntityFlow,
      startGameFlow,
      startImageProject,
      startScriptFlow,
      startStoryboardFlow,
      startVideoFlow,
      startWorkflowFlow
    ]
  );

  const handleEntryCard = useCallback(
    (id: string) => {
      if (pendingFlow !== null || starting) {
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
    [pendingFlow, runDestinationFlow, starting]
  );

  // The chosen card says what it is doing; the other cards are off, because a
  // second flow started over the first would create an unwanted draft.
  const entryOptions = useMemo<readonly OptionCardItem[]>(() => {
    const cards = ENTRY_CARDS.map((card) => ({
      ...card,
      image: ENTRY_BACKGROUNDS[card.id]
    }));
    if (pendingFlow === null) {
      return cards;
    }
    return cards.map((card) =>
      card.id === pendingFlow
        ? {
            ...card,
            meta: "Creating…",
            disabled: true,
            disabledReason: "Creating your project…"
          }
        : {
            ...card,
            disabled: true,
            disabledReason: "One flow is already starting."
          }
    );
  }, [pendingFlow]);

  /**
   * The flow's last step wrote stage `done`: hand the finished board its own
   * tab and let this one go.
   *
   * The workflow flow is the one that returns a result — it builds, validates
   * and may test-run on its final action — and those failures are reported
   * here, because this tab is the last place that holds them.
   */
  const handleSetupFinished = useCallback(
    async (result?: BuildFromPlanResult | null) => {
      const target = setupTargetRef.current;
      if (!target || target.kind === "entity") {
        return;
      }
      if (!(await showDocumentProject(target.projectId, target.name))) {
        return;
      }
      const failures = result ? buildFailures(result) : [];
      if (failures.length > 0) {
        addNotification({
          type: "warning",
          alert: true,
          content: `Opened your workflow, but ${failures.join(" ")}`
        });
      }
      openTab({
        type: SETUP_TAB_TYPE[target.kind],
        ref: target.id,
        mode: "edit",
        title: target.name,
        projectId: target.projectId
      });
      applySetupTarget(null);
      if (flowRef) closeTab(tabId("guided-flow", flowRef));
    },
    [addNotification, applySetupTarget, closeTab, flowRef, openTab, showDocumentProject]
  );

  const handleEntityFinished = useCallback(() => {
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
   * the creator typed in step 1 comes back to the composer, which still holds
   * every reference and entity it had — this surface never unmounted, it only
   * rendered the flow instead.
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
      applySetupTarget(null);
    },
    [applySetupTarget, flowRef, openTab, personalProjectId, setActiveProjectId]
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
      await deleteSetupDocument(placeholder);
      return copy.id;
    },
    [applySetupTarget, createWorkflow]
  );

  /**
   * E2 § 8.1 "Start from a script": the brief goes to E3 and this tab becomes
   * the script flow, in the project the video card already made. The sequence
   * stays where it is — the script's `Send to timeline` is the way back.
   */
  const startScriptFromVideo = useCallback(
    async (brief: string) => {
      const target = setupTargetRef.current;
      if (!target) {
        return;
      }
      const text = brief.trim();
      const name =
        text.length > 0 ? projectNameFromPrompt(text, null) : target.name;
      try {
        const script = await createScript.mutateAsync({
          name,
          projectId: target.projectId,
          document: newScriptSetupDocument(text)
        });
        applySetupTarget({
          kind: "script",
          id: script.id,
          projectId: target.projectId,
          name,
          ownsProject: target.ownsProject
        });
      } catch (error) {
        reportEntryFailure("script", error);
      }
    },
    [applySetupTarget, createScript, reportEntryFailure]
  );

  // A start that was parked on provider onboarding resumes on its own once a
  // provider is connected, so the user finishes the thing they asked for.
  const resumeProject = useRef(handleStart);
  resumeProject.current = handleStart;
  useEffect(() => {
    if (!pendingStart || !hasConfiguredProvider) {
      return;
    }
    setPendingStart(false);
    void resumeProject.current();
  }, [pendingStart, hasConfiguredProvider]);

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

  // An entry card was clicked: this tab is the flow now (PRD § 6.1).
  if (setupTarget) {
    if (setupTarget.kind === "entity") {
      if (setupTarget.initialAssetId) {
        return (
          <EntitySetupHost
            projectId={setupTarget.projectId}
            draftKey={flowRef}
            initialDescriptor={setupTarget.initialDescriptor ?? prompt.trim()}
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
          initialDescriptor={setupTarget.initialDescriptor ?? prompt.trim()}
          onFinish={handleEntityFinished}
          onChangeFlow={handleChangeFlow}
        />
      );
    }
    if (setupTarget.kind === "video") {
      return (
        <VideoSetupHost
          sequenceId={setupTarget.id}
          onFinish={handleSetupFinished}
          onStartFromScript={(brief) => void startScriptFromVideo(brief)}
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
        <FlexColumn gap={SPACING.md} sx={{ p: SPACING.xl }}>
          <Text size="big">Legacy game setup</Text>
          <Caption>
            This setup used the removed Godot workflow. Its source files and generated assets remain available. Create a native game to rebuild its gameplay.
          </Caption>
          <EditorButton onClick={() => void startGameFlow(setupTarget.projectId)}>
            Create native game
          </EditorButton>
        </FlexColumn>
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

  return (
    <ScrollArea fullHeight>
      <FlexColumn align="center" sx={{ minHeight: "100%", px: SPACING.xl }}>
        <FlexColumn
          gap={SPACING.xl}
          sx={{
            width: "100%",
            maxWidth: `${COLUMN_WIDTH}px`,
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

          <CurrentProjectDocuments />

          <FlexColumn gap={SPACING.md} align="center">
            <Text size="big">What do you want to make?</Text>
            <Caption
              color="secondary"
              sx={{ maxWidth: "560px", textAlign: "center" }}
            >
              An agent plans the documents and builds them while you watch.
              Everything it makes stays editable.
            </Caption>
          </FlexColumn>

          <FlexColumn
            id="guided-flows"
            gap={SPACING.md}
            sx={{
              "& button": { bgcolor: "common.black" },
              '& button:not([aria-disabled="true"]):hover': {
                bgcolor: "common.black",
                borderColor: "primary.main"
              },
              "& img": { opacity: 0.6 }
            }}
          >
            <Caption color="muted">Start with a guided flow</Caption>
            <OptionCardGrid
              label="Guided creation flows"
              options={entryOptions}
              onSelect={handleEntryCard}
              minColumnWidth={190}
              variant="media"
              // These cards route to a flow, they do not pick one of a set:
              // no pressed state, and each is its own tab stop.
              mode="navigation"
            />
          </FlexColumn>

          {/* The composer sits below the cards, not above them: its `/` and `@`
              menus open upward from the box's top edge
              (`useTextareaSkillMention`), so it needs the page above it as
              headroom. */}
          <Caption color="muted">Or describe what you want to make</Caption>
          <FlexColumn
            gap={SPACING.lg}
            sx={{
              mt: -SPACING.lg,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "primary.main",
              borderRadius: BORDER_RADIUS.lg,
              p: SPACING.xl
            }}
          >
            <TextInput
              value={prompt}
              autoFocus
              multiline
              rows={3}
              label="Chat prompt"
              hideLabel
              inputRef={promptRef}
              placeholder="A 30-second launch spot for our desk lamp — warm, minimal, night-time mood. Type / for a skill, @ for an asset or entity."
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handlePromptKeyDown}
            />
            {mentionMenu}
            {skillMenu}

            {droppedFiles.length > 0 && (
              <FlexRow gap={SPACING.md} wrap>
                {droppedFiles.map((file) => (
                  <Box key={file.id} sx={{ position: "relative" }}>
                    <ResponsiveImage
                      locator={file.dataUri}
                      alt={file.name}
                      fit="cover"
                      borderRadius={BORDER_RADIUS.sm}
                      showErrorFallback
                      sx={{ width: "48px", height: "48px" }}
                    />
                    <CloseButton
                      onClick={() => removeFile(file.id)}
                      tooltip={`Remove ${file.name}`}
                      buttonSize="small"
                      iconVariant="clear"
                      sx={{
                        position: "absolute",
                        top: -SPACING_PX.xs,
                        right: -SPACING_PX.xs
                      }}
                    />
                  </Box>
                ))}
              </FlexRow>
            )}

            <FlexRow align="center" gap={SPACING.md} wrap>
              <EditorButton
                variant="outlined"
                density="compact"
                onClick={() => refInputRef.current?.click()}
              >
                {`Ref images · ${droppedFiles.length}`}
              </EditorButton>
              <input
                ref={refInputRef}
                type="file"
                accept="image/*"
                multiple
                aria-label="Reference images"
                onChange={handleRefImages}
                style={{ display: "none" }}
              />
              <EditorButton
                variant="outlined"
                density="compact"
                onClick={(event) => setEntityAnchor(event.currentTarget)}
              >
                {selectedEntities.length === 0
                  ? "Entities · none"
                  : `Entities · ${selectedEntities
                      .map((entity) => entity.name)
                      .join(", ")}`}
              </EditorButton>
              <EditorButton
                ref={modelButtonRef}
                variant="outlined"
                density="compact"
                onClick={(event) => setModelAnchor(event.currentTarget)}
              >
                {isModelSelected(selectedModel)
                  ? `Model · ${selectedModel?.name || selectedModel?.id}`
                  : "Select a model"}
              </EditorButton>
              <Box sx={{ flex: 1 }} />
              {estimate && (
                <Box component="span" sx={{ ...TYPOGRAPHY.mono.caption }}>
                  {formatEstimate(estimate)}
                </Box>
              )}
              <Caption color="muted" aria-hidden>
                {sendShortcutLabel}
              </Caption>
              <EditorButton
                variant="contained"
                color="primary"
                density="normal"
                disabled={prompt.trim().length === 0 || starting || isUploading}
                onClick={() => void handleStart()}
              >
                Send to chat
              </EditorButton>
            </FlexRow>
          </FlexColumn>

          {starters.length > 0 && (
            <FlexColumn
              gap={SPACING.md}
              align="center"
              sx={{ mt: -SPACING.lg }}
            >
              <FlexRow
                justify="center"
                gap={SPACING.sm}
                wrap
                role="group"
                aria-label="Start from a skill"
              >
                {visibleStarters.map((entry) => {
                  const active = entry.name === starter?.name;
                  return (
                    <Tooltip
                      key={entry.name}
                      title={entry.description}
                      placement="bottom"
                      // Described by, not named by: the pill's name stays the
                      // skill's label.
                      describeChild
                    >
                      <Chip
                        clickable
                        variant="outlined"
                        label={starterLabel(entry.name)}
                        aria-pressed={active}
                        onClick={() => handleToggleStarter(entry.name)}
                        sx={{
                          ...starterPillSx,
                          ...(active && activeStarterPillSx)
                        }}
                      />
                    </Tooltip>
                  );
                })}
                {(hiddenStarterCount > 0 || showAllStarters) && (
                  <Chip
                    clickable
                    variant="outlined"
                    aria-expanded={showAllStarters}
                    label={
                      showAllStarters
                        ? "Show fewer"
                        : `${hiddenStarterCount} more`
                    }
                    onClick={() => setShowAllStarters((shown) => !shown)}
                    sx={{ ...starterPillSx, borderStyle: "dashed" }}
                  />
                )}
              </FlexRow>
              {starter ? (
                <Caption
                  color="secondary"
                  sx={{ maxWidth: "620px", textAlign: "center" }}
                >
                  {starter.description}
                </Caption>
              ) : (
                <Caption color="muted">
                  Pick a skill to start from, or just describe what you want.
                </Caption>
              )}
            </FlexColumn>
          )}

          {/* Examples come after the composer: they are a place to browse,
              not the first thing to do, and above it they pushed the prompt
              below the fold. */}
          <DashboardExampleApps compact onBrowseAll={handleOpenExamples} />
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
              Blank document
            </Caption>
            <Caption color="muted">
              — opens as a loose tab, outside any project
            </Caption>
            <Box sx={{ flex: 1 }} />
            <EditorButton
              variant="text"
              density="compact"
              onClick={handleOpenExamples}
            >
              Browse examples
            </EditorButton>
            <EditorButton
              variant="text"
              density="compact"
              onClick={handleOpenTutorials}
            >
              Tutorials
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
              <Box
                key={entry.key}
                component="button"
                type="button"
                disabled={creating !== null}
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
                  display: "flex",
                  alignItems: "center",
                  gap: (theme) => theme.spacing(SPACING.md),
                  height: "32px",
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
                  {entry.submenu ? `${entry.label} ▸` : entry.label}
                </Label>
              </Box>
            ))}
          </Box>
        </FlexColumn>
      </FlexColumn>

      <Popover
        open={entityAnchor !== null}
        anchorEl={entityAnchor}
        onClose={() => setEntityAnchor(null)}
        placement="bottom-left"
        maxWidth={320}
        maxHeight="50vh"
      >
        <FlexColumn sx={{ width: 300, py: SPACING.micro }}>
          {(entities ?? []).length === 0 ? (
            <Caption color="secondary" sx={{ px: SPACING.md, py: SPACING.sm }}>
              The entity library is empty.
            </Caption>
          ) : (
            (entities ?? []).map((entity) => (
              <MenuItemPrimitive
                key={entity.id}
                label={entity.name}
                secondary={entity.kind}
                compact
                selected={entityIds.includes(entity.id)}
                onClick={() => toggleEntity(entity)}
              />
            ))
          )}
        </FlexColumn>
      </Popover>

      <LanguageModelMenuDialog
        open={modelAnchor !== null}
        anchorEl={modelAnchor}
        onClose={() => setModelAnchor(null)}
        onModelChange={(model) => {
          setSelectedModel(model);
          setModelAnchor(null);
        }}
        requireToolSupport
      />

      <Popover
        open={submenu !== null}
        anchorEl={submenu?.element ?? null}
        onClose={() => setSubmenu(null)}
        placement="top-left"
        maxWidth={340}
        maxHeight="50vh"
      >
        <FlexColumn sx={{ width: 320, py: SPACING.micro }}>
          {submenu?.kind === "texts" &&
            TEXT_FILE_TEMPLATES.map((template) => (
              <MenuItemPrimitive
                key={template.filename}
                label={template.label}
                compact
                disabled={creating !== null}
                onClick={() => {
                  void createTextFile(template);
                }}
              />
            ))}
          {submenu?.kind === "storyboards" && (
            <>
              <MenuItemPrimitive
                label="Blank storyboard"
                compact
                dividerAfter
                disabled={creating !== null}
                onClick={() => {
                  void createBlankStoryboard();
                }}
              />
              {!examplesLoading &&
                (exampleData ?? []).map((example) => (
                  <MenuItemPrimitive
                    key={example.slug}
                    label={example.name}
                    secondary={`${example.shotCount} shot${
                      example.shotCount === 1 ? "" : "s"
                    }, already rendered`}
                    compact
                    disabled={creating !== null}
                    onClick={() => {
                      void installStoryboardExample(example.slug, example.name);
                    }}
                  />
                ))}
            </>
          )}
        </FlexColumn>
      </Popover>
    </ScrollArea>
  );
};

export default NewProjectSurface;
