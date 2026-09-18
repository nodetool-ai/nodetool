/**
 * The guided-flow starters behind the `+ New` menu's first section.
 *
 * One starter per entry card (see `../setup/entryCards`): clicking it creates
 * a loose document with its stage already at `idea` and opens the tab
 * straight away, so the surface the tab hosts resumes the flow from the
 * document alone. No project row is made — the document is filed into
 * whichever project is open via {@link creationProjectId}, the way every
 * blank document from this menu is.
 *
 * This mirrors the New Project surface's entry cards and Studio's home cards,
 * minus their project creation: those hosts describe a project that does not
 * exist yet, while this menu creates into the open one.
 */

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  writeGameSetup,
  writeWorkflowSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { useCreateStoryboard } from "../../hooks/storyboard/useStoryboards";
import { useCreateScript } from "../../hooks/script/useScripts";
import {
  useCreateTimeline,
  useSeedTimelineDetail
} from "../../hooks/useTimelineSequence";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../trpc/client";
import { ENTRY_CARDS, type EntryFlowId } from "../setup/entryCards";
import { GUIDED_FLOW_ICONS } from "./menuIcons";
import { newStoryboardSetupDocument } from "../setup/storyboard/useStoryboardSetupFlow";
import { newScriptSetupDocument } from "../setup/script/useScriptSetupFlow";
import { newVideoSetupDocument } from "../setup/video/useVideoSetupFlow";
import { startImageFlow } from "../setup/image/startImageFlow";
import { openPageTab } from "./openPageTab";

export interface GuidedFlowStarter {
  id: EntryFlowId;
  title: string;
  description: string;
  icon: ReactNode;
  start: () => Promise<void>;
}

/**
 * What the menu names two of the cards. The app's document lists read
 * "Timelines" and "Sketches" (the left panel, quick access, the panels'
 * own create buttons), so the menu does too — the entry cards keep their
 * own copy for the New Project surface and Studio.
 */
const MENU_TITLES: Partial<Record<EntryFlowId, string>> = {
  video: "Timeline",
  image: "Sketch"
};

export interface GuidedFlowStarters {
  starters: readonly GuidedFlowStarter[];
  /** The flow being created right now, if any — callers disable while set. */
  starting: EntryFlowId | null;
}

/**
 * The seven guided starters, each reporting failure as a toast rather than a
 * dead click. `onStarted` lets the caller close its own menu when one lands.
 */
export const useGuidedFlowStarters = (
  onStarted?: () => void
): GuidedFlowStarters => {
  const [starting, setStarting] = useState<EntryFlowId | null>(null);

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const createStoryboard = useCreateStoryboard();
  const createScript = useCreateScript();
  const createTimeline = useCreateTimeline();
  const seedTimelineDetail = useSeedTimelineDetail();
  const createWorkflow = useWorkflowManager((state) => state.create);

  const runStart = useCallback(
    async (id: EntryFlowId, start: () => Promise<void>) => {
      setStarting(id);
      try {
        await start();
        onStarted?.();
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not start the guided flow: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        });
      } finally {
        setStarting(null);
      }
    },
    [addNotification, onStarted]
  );

  const startStoryboard = useCallback(
    () =>
      runStart("storyboard", async () => {
        const projectId = creationProjectId();
        const created = await createStoryboard.mutateAsync({
          name: "Untitled storyboard",
          projectId,
          document: newStoryboardSetupDocument("")
        });
        openTab({
          type: "storyboard",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runStart, createStoryboard, openTab]
  );

  const startVideo = useCallback(
    () =>
      runStart("video", async () => {
        const projectId = creationProjectId();
        const sequence = await createTimeline.mutateAsync({
          name: "Untitled timeline",
          projectId
        });
        // `timeline.create` takes no document, so the setup lands as one
        // PATCH straight after — before the tab opens, so the flow never
        // flashes the editor. The create seeded the detail cache with a
        // setup-less copy; the tab must not load that one.
        const withSetup = await trpcClient.timeline.update.mutate({
          id: sequence.id,
          document: newVideoSetupDocument("")
        });
        seedTimelineDetail(withSetup);
        openTab({
          type: "timeline",
          ref: sequence.id,
          mode: "edit",
          title: sequence.name || "Untitled timeline",
          projectId: sequence.projectId
        });
      }),
    [runStart, createTimeline, seedTimelineDetail, openTab]
  );

  const startScript = useCallback(
    () =>
      runStart("script", async () => {
        const projectId = creationProjectId();
        const created = await createScript.mutateAsync({
          name: "Untitled script",
          projectId,
          document: newScriptSetupDocument("")
        });
        openTab({
          type: "script",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runStart, createScript, openTab]
  );

  const startImage = useCallback(
    () =>
      runStart("image", async () => {
        const projectId = creationProjectId();
        const started = await startImageFlow({
          name: "Untitled sketch",
          projectId,
          brief: ""
        });
        openTab({
          type: "sketch",
          ref: started.documentId,
          mode: "edit",
          title: started.name,
          projectId
        });
      }),
    [runStart, openTab]
  );

  const startWorkflow = useCallback(
    () =>
      runStart("workflow", async () => {
        const projectId = creationProjectId();
        const created = await createWorkflow({
          name: "Untitled workflow",
          description: "",
          tags: [],
          access: "private",
          project_id: projectId,
          settings: writeWorkflowSetup({}, { stage: "idea", brief: "" })
        });
        openTab({
          type: "workflow",
          ref: created.id,
          mode: "edit",
          title: created.name || "Untitled workflow",
          projectId
        });
      }),
    [runStart, createWorkflow, openTab]
  );

  const startGame = useCallback(
    () =>
      runStart("game", async () => {
        const projectId = creationProjectId();
        const created = await createWorkflow({
          name: "Untitled game",
          description: "",
          tags: [],
          access: "private",
          project_id: projectId,
          settings: writeGameSetup({}, { stage: "idea", brief: "" })
        });
        openTab({
          type: "workflow",
          ref: created.id,
          mode: "edit",
          title: created.name || "Untitled game",
          projectId
        });
      }),
    [runStart, createWorkflow, openTab]
  );

  // Entities have no document tab — the library is their surface — so the
  // starter opens it, where `Add entity` runs the same guided steps.
  const startEntity = useCallback(
    () =>
      runStart("entity", async () => {
        openPageTab("entities");
      }),
    [runStart]
  );

  const starters = useMemo<readonly GuidedFlowStarter[]>(() => {
    const startById: Record<EntryFlowId, () => Promise<void>> = {
      entity: startEntity,
      storyboard: startStoryboard,
      video: startVideo,
      script: startScript,
      image: startImage,
      workflow: startWorkflow,
      game: startGame
    };
    return ENTRY_CARDS.map((card) => ({
      id: card.id,
      title: MENU_TITLES[card.id] ?? card.title,
      description: card.description ?? "",
      icon: GUIDED_FLOW_ICONS[card.id],
      start: startById[card.id]
    }));
  }, [
    startEntity,
    startGame,
    startImage,
    startScript,
    startStoryboard,
    startVideo,
    startWorkflow
  ]);

  return { starters, starting };
};
