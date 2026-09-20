/**
 * The guided-flow starters behind the `+ New` menu's first section.
 *
 * One starter per entry card (see `../setup/entryCards`): picking one asks
 * where the flow should live — the open project or a project row made for
 * it — then creates a document with its stage already at `idea` and opens
 * the tab straight away, so the surface the tab hosts resumes the flow from
 * the document alone.
 *
 * This mirrors the New Project surface's entry cards and Studio's home cards,
 * minus their project creation: those hosts describe a project that does not
 * exist yet, while this menu defaults to the one that is open.
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
import { useCreateProject, useOpenProject } from "../../hooks/useProjects";
import {
  GUIDED_FLOW_NEW_PROJECT_NAME,
  GUIDED_FLOW_PROJECT_KIND,
  useCurrentProjectDisplay
} from "../setup/guidedFlowProject";
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
  /**
   * Clicking the row asks for the destination first — the hook holds the
   * pending flow until it is picked. Tests and the entity starter (which has
   * no document to file) call this straight away, filing into the open
   * project unless a project id is given.
   */
  start: (projectId?: string) => Promise<void>;
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

export interface PendingGuidedFlow {
  id: EntryFlowId;
  title: string;
}

export interface GuidedFlowStarters {
  starters: readonly GuidedFlowStarter[];
  /** The flow being created right now, if any — callers disable while set. */
  starting: EntryFlowId | null;
  /**
   * The flow waiting for its destination. Set, and the caller renders the
   * project picker; picking resolves it into a start. Null when no flow is
   * waiting — the entity starter has no document to file, so it never waits.
   */
  pendingDestination: PendingGuidedFlow | null;
  /** The project a "current project" pick files into, as the picker names it. */
  currentProject: { id: string; name: string };
  pickDestination: (destination: "current" | "new") => void;
  cancelDestination: () => void;
}

/**
 * The seven guided starters, each reporting failure as a toast rather than a
 * dead click. `onStarted` lets the caller close its own menu when one lands.
 *
 * Clicking a starter does not create anything yet — it holds the flow as
 * `pendingDestination` so the caller can ask where it should live. Picking
 * "current" files into the open project the way every blank document from
 * this menu does; picking "new" makes a project row for the flow first and
 * opens its group, so the tab that follows lands somewhere visible.
 */
export const useGuidedFlowStarters = (
  onStarted?: () => void
): GuidedFlowStarters => {
  const [starting, setStarting] = useState<EntryFlowId | null>(null);
  const [pendingDestination, setPendingDestination] =
    useState<PendingGuidedFlow | null>(null);

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const createStoryboard = useCreateStoryboard();
  const createScript = useCreateScript();
  const createTimeline = useCreateTimeline();
  const seedTimelineDetail = useSeedTimelineDetail();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const createProject = useCreateProject();
  const openProject = useOpenProject();
  const currentProject = useCurrentProjectDisplay();

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
    (projectIdOverride?: string) =>
      runStart("storyboard", async () => {
        const projectId = projectIdOverride ?? creationProjectId();
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
    (projectIdOverride?: string) =>
      runStart("video", async () => {
        const projectId = projectIdOverride ?? creationProjectId();
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
    (projectIdOverride?: string) =>
      runStart("script", async () => {
        const projectId = projectIdOverride ?? creationProjectId();
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
    (projectIdOverride?: string) =>
      runStart("image", async () => {
        const projectId = projectIdOverride ?? creationProjectId();
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
    (projectIdOverride?: string) =>
      runStart("workflow", async () => {
        const projectId = projectIdOverride ?? creationProjectId();
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
    (projectIdOverride?: string) =>
      runStart("game", async () => {
        const projectId = projectIdOverride ?? creationProjectId();
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
    const startById: Record<
      EntryFlowId,
      (projectId?: string) => Promise<void>
    > = {
      entity: startEntity,
      storyboard: startStoryboard,
      video: startVideo,
      script: startScript,
      image: startImage,
      workflow: startWorkflow,
      game: startGame
    };
    return ENTRY_CARDS.map((card) => {
      const title = MENU_TITLES[card.id] ?? card.title;
      return {
        id: card.id,
        title,
        description: card.description ?? "",
        icon: GUIDED_FLOW_ICONS[card.id],
        start: (projectId?: string) => {
          // An explicit project answers the destination question already —
          // the picker asked, or a test drives the starter straight at one.
          // Entities have no document to file, so they never wait either.
          if (projectId !== undefined || card.id === "entity") {
            return startById[card.id](projectId);
          }
          setPendingDestination({ id: card.id, title });
          // The picker is the surface now, so the menu that opened it goes
          // away rather than sitting behind the dialog.
          onStarted?.();
          return Promise.resolve();
        }
      };
    });
  }, [
    onStarted,
    startEntity,
    startGame,
    startImage,
    startScript,
    startStoryboard,
    startVideo,
    startWorkflow
  ]);

  /**
   * Resolve the waiting flow into a start. "Current" files into the open
   * project; "new" makes a project row for the flow first and opens its
   * group, so the tab the flow opens lands somewhere visible.
   */
  const pickDestination = useCallback(
    (destination: "current" | "new") => {
      const pending = pendingDestination;
      setPendingDestination(null);
      if (!pending) {
        return;
      }
      const starter = starters.find((entry) => entry.id === pending.id);
      if (!starter) {
        return;
      }
      if (destination === "current") {
        // Explicit, so the starter runs rather than asking again.
        void starter.start(currentProject.id);
        return;
      }
      // The menu starts flows with an empty brief, so the row takes the
      // flow's own fallback name — the same one the New Project surface uses
      // when its prompt is empty.
      setStarting(pending.id);
      void (async () => {
        try {
          const project = await createProject.mutateAsync({
            name: GUIDED_FLOW_NEW_PROJECT_NAME[pending.id],
            kind: GUIDED_FLOW_PROJECT_KIND[pending.id]
          });
          const opened = await openProject(project);
          if (!opened) {
            return;
          }
          await starter.start(project.id);
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
      })();
    },
    [
      addNotification,
      createProject,
      currentProject,
      openProject,
      pendingDestination,
      starters
    ]
  );

  const cancelDestination = useCallback(() => {
    setPendingDestination(null);
  }, []);

  return {
    starters,
    starting,
    pendingDestination,
    currentProject,
    pickDestination,
    cancelDestination
  };
};
