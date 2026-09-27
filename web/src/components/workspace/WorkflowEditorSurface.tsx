/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import NodeEditor from "../node_editor/NodeEditor";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  useWorkflowSetupDocument,
  useWorkflowSetupStage
} from "../../hooks/workflow/useWorkflowSetup";
import {
  readWorkflowBuild,
  workflowBuildResult,
  type BuildFromPlanResult
} from "../../hooks/workflow/useBuildFromPlan";
import type { Message, Workflow } from "../../stores/ApiTypes";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  creationProjectId,
  tabId,
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useCreateApplication } from "../../hooks/useApplications";
import { useOpenApplication } from "../../hooks/useOpenApplication";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import WorkflowSetupHost from "../setup/workflow/WorkflowSetupHost";
import {
  examplePackageName,
  exampleSeedRef
} from "../../utils/exampleWorkflow";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import KeyboardProvider from "../KeyboardProvider";
import FloatingToolBar from "../panels/FloatingToolBar";
import QueueOverlay from "../panels/QueueOverlay";
import StatusMessage from "../panels/StatusMessage";
import NodeCreateBridge from "../editor/NodeCreateBridge";
import WorkflowChainSurface from "./WorkflowChainSurface";
import SubgraphTabStrip from "./SubgraphTabStrip";
import SubgraphTabContent from "./SubgraphTabContent";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  BORDER_RADIUS,
  ConflictBanner,
  Box,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import WorkflowGraphPreview from "../version/WorkflowGraphPreview";
import { WorkflowLandingChecklist } from "../setup/workflow/WorkflowLandingChecklist";

// Floating editor status message: sits above the canvas and node overlays but
// below the node-info panel (15000) and find dialog (20000). Beyond the shared
// Z_INDEX scale, so it stays a documented local constant.
const STATUS_MESSAGE_Z_INDEX = 10000;

interface WorkflowEditorSurfaceProps {
  workflowId: string;
  mode?: WorkspaceTabMode;
  active: boolean;
}

/**
 * The Edit surface for a workflow tab: the ReactFlow node editor with its
 * provider stack and editor overlays, scoped to a single workflow. Extracted
 * from TabsNodeEditor so the workspace shell can host one workflow per tab.
 * The per-workflow NodeStore stays owned by the WorkflowManager; this surface
 * just looks it up (and triggers a fetch when a restored tab has none yet).
 *
 * A workflow whose `settings.game` is not at stage `done` is still mid-flow,
 * and this tab is where it is reopened after a refresh or a close — the New
 * Project tab that started the flow holds its target in component state, which
 * a reload throws away (game-prd criterion 2). So the setup host takes the tab
 * until the flow finishes, and `Build your game` hands the same tab back to
 * the canvas rather than opening a second one. A workflow saved before the
 * flow existed has no `game` key and reads `done`, so it opens as it always
 * did.
 */
const WorkflowEditorSurface = ({
  workflowId,
  mode = "edit",
  active
}: WorkflowEditorSurfaceProps) => {
  const nodeStore = useWorkflowManager((state) =>
    state.getNodeStore(workflowId)
  );
  const workflow = useWorkflowManager((state) => state.getWorkflow(workflowId));
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const workflowProjectId = useWorkspaceTabsStore(
    (state) =>
      state.tabs.find(
        (tab) => tab.type === "workflow" && tab.ref === workflowId
      )?.projectId
  );
  const createApplication = useCreateApplication();
  const openApplication = useOpenApplication();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const editorViewMode = useSettingsStore(
    (state) => state.settings.editorViewMode
  );
  const [missing, setMissing] = useState(false);
  // A workflow flow still in setup (`settings.setup` not at `done`) is where
  // this tab lands after a refresh or a close — same rule as the game flow
  // above. A workflow saved before the flow existed has no `setup` key and
  // reads `done`, so it opens as the canvas it always did.
  const setupStage = useWorkflowSetupStage(workflowId);
  const setup = useWorkflowSetupDocument(workflowId);
  const persistedBuild = readWorkflowBuild(setup);
  // The document reaches stage `done` in the same click that places the nodes,
  // but this keeps the swap independent of when that save lands.
  // The document reaches stage `done` in the same click that places the
  // nodes, but this keeps the swap independent of when that save lands.
  const [setupFinished, setSetupFinished] = useState(false);
  const [landingResult, setLandingResult] =
    useState<BuildFromPlanResult | null>(null);
  const [landingDismissed, setLandingDismissed] = useState(false);
  const openWorkflowThread = useGlobalChatStore(
    (state) => state.openWorkflowThread
  );
  const sendMessage = useGlobalChatStore((state) => state.sendMessage);
  const finishSetupFlow = useCallback(
    (result: BuildFromPlanResult | null) => {
      // The flow's own surface is gone the moment the canvas takes the tab,
      // so a placement gap, a validation error or a refused test run has to
      // be said here or it is never said at all.
      const failures: string[] = [];
      if (result) {
        if (result.issues.length > 0) {
          failures.push(
            `${result.issues.length} connection${result.issues.length === 1 ? "" : "s"} could not be wired.`
          );
        }
        if (result.validationErrors.length > 0) {
          failures.push(
            `The graph did not validate: ${result.validationErrors.join("; ")}`
          );
        }
        if (result.testRun.error) {
          failures.push(`The test run was refused: ${result.testRun.error}`);
        }
      }
      if (failures.length > 0) {
        addNotification({
          type: "warning",
          alert: true,
          content: `Opened your workflow, but ${failures.join(" ")}`
        });
      }
      setLandingResult(result);
      setLandingDismissed(false);
      setSetupFinished(true);
    },
    [addNotification]
  );

  const visibleLanding =
    !landingDismissed &&
    (landingResult ??
      (setupStage === "done" && persistedBuild
        ? workflowBuildResult(persistedBuild)
        : null));
  const landingRunMode =
    setup?.run_mode === "app" || setup?.run_mode === "trigger"
      ? setup.run_mode
      : "manual";

  const handleAskAgent = useCallback(
    async (message: string) => {
      try {
        const threadId = await openWorkflowThread(workflowId);
        openTab({
          type: "chat",
          ref: threadId,
          mode: "view",
          title: "Workflow repair",
          projectId: useGlobalChatStore.getState().threads[threadId]?.project_id
        });
        await sendMessage(
          {
            type: "message",
            name: "",
            role: "user",
            content: message
          } as Message,
          threadId
        );
        setLandingDismissed(true);
      } catch (cause) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not open the repair chat: ${
            cause instanceof Error ? cause.message : String(cause)
          }`
        });
      }
    },
    [addNotification, openTab, openWorkflowThread, sendMessage, workflowId]
  );

  const handleLandingNext = useCallback(async () => {
    if (landingRunMode === "app") {
      try {
        const created = await createApplication.mutateAsync({
          name: workflow?.name || "Untitled app",
          description: workflow?.description ?? "",
          projectId: workflowProjectId ?? creationProjectId(),
          fromWorkflowId: workflowId
        });
        setLandingDismissed(true);
        openApplication(created.id, created.name, created.projectId);
      } catch (cause) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not create the Mini App: ${
            cause instanceof Error ? cause.message : String(cause)
          }`
        });
      }
      return;
    }
    setLandingDismissed(true);
    if (landingRunMode === "trigger") {
      useNodeMenuStore.getState().openNodeMenu({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        centerOnScreen: true,
        searchTerm: "trigger"
      });
      return;
    }
    addNotification({
      type: "info",
      alert: true,
      content:
        "The canvas is ready. Change its inputs and run it again when you are ready."
    });
  }, [
    addNotification,
    createApplication,
    landingRunMode,
    openApplication,
    workflow,
    workflowId,
    workflowProjectId
  ]);
  /**
   * "Start from an example" in step 1's inline browser: the copy lands in a
   * new row (materialized server-side from the example's package), which
   * opens as its own tab while this placeholder closes. The tab's project
   * carries over, so the copy stays in the group it was started from.
   */
  const startFromExample = useCallback(
    async (example: Workflow): Promise<string | null> => {
      const tags = example.tags ?? [];
      const copy = await createWorkflow(
        {
          name: example.name,
          description: example.description,
          package_name: example.package_name,
          tags: tags.includes("example") ? tags : [...tags, "example"],
          access: "private"
        },
        examplePackageName(example),
        exampleSeedRef(example)
      );
      const projectId = useWorkspaceTabsStore
        .getState()
        .tabs.find(
          (tab) => tab.type === "workflow" && tab.ref === workflowId
        )?.projectId;
      openTab({
        type: "workflow",
        ref: copy.id,
        mode: "edit",
        title: copy.name || example.name,
        projectId
      });
      closeTab(tabId("workflow", workflowId));
      return copy.id;
    },
    [closeTab, createWorkflow, openTab, workflowId]
  );
  // Only this workflow's subgraph tabs may take over its canvas — another
  // workflow tab's open subgraph must not hijack this one.
  const activeSubgraph = useSubgraphTabsStore((state) =>
    state.tabs.find(
      (tab) => tab.key === state.activeKey && tab.workflowId === workflowId
    )
  );

  useEffect(() => {
    if (nodeStore) {
      setMissing(false);
      return;
    }

    let cancelled = false;
    void fetchWorkflow(workflowId).then((loadedWorkflow) => {
      if (cancelled || loadedWorkflow) {
        return;
      }
      setMissing(true);
      closeTab(tabId("workflow", workflowId));
    });

    return () => {
      cancelled = true;
    };
  }, [nodeStore, fetchWorkflow, workflowId, closeTab]);

  if (!nodeStore) {
    if (missing) {
      return null;
    }
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (mode === "view") {
    return (
      <WorkflowGraphPreview
        graph={workflow?.graph}
        workflowId={workflowId}
        width="100%"
        height="100%"
      />
    );
  }

  if (setupStage !== "done" && !setupFinished) {
    return (
      <WorkflowSetupHost
        workflowId={workflowId}
        onStartFromExample={startFromExample}
        onFinish={finishSetupFlow}
      />
    );
  }

  const showChain = active && editorViewMode === "chain";

  return (
    <NodeContext.Provider value={nodeStore}>
      <ReactFlowProvider>
        <ContextMenuProvider>
          <ConnectableNodesProvider>
            <KeyboardProvider>
              {active && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 16,
                    zIndex: STATUS_MESSAGE_Z_INDEX
                  }}
                >
                  <StatusMessage />
                </div>
              )}
              <WorkflowConflictBanner workflowId={workflowId} />
              {visibleLanding && (
                <Box
                  sx={{
                    position: "absolute",
                    top: SPACING.md,
                    left: SPACING.md,
                    right: SPACING.md,
                    maxWidth: 720,
                    margin: "0 auto",
                    padding: SPACING.lg,
                    backgroundColor: "background.paper",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: BORDER_RADIUS.md,
                    zIndex: STATUS_MESSAGE_Z_INDEX + 1
                  }}
                >
                  <WorkflowLandingChecklist
                    result={visibleLanding}
                    runMode={landingRunMode}
                    onNextStep={handleLandingNext}
                    nextStepPending={createApplication.isPending}
                    onAskAgent={(message) => void handleAskAgent(message)}
                  />
                </Box>
              )}
              <SubgraphTabStrip
                hostId={workflowId}
                hostActiveKey={null}
                hostLabel="Workflow"
              />
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                  width: "100%",
                  height: "100%"
                }}
              >
                {/* The chain view replaces the canvas for the active tab. The
                    node editor stays mounted underneath so toggling back keeps
                    its viewport and transient editor state. */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: showChain || activeSubgraph ? "none" : undefined
                  }}
                >
                  <NodeEditor workflowId={workflowId} active={active} />
                </div>
                {/* A subgraph takes over the canvas the same way the chain view
                    does, and for the same reason: the parent editor stays
                    mounted underneath so returning to it keeps its viewport. */}
                {activeSubgraph && !showChain && (
                  <div style={{ position: "absolute", inset: 0 }}>
                    <SubgraphTabContent tab={activeSubgraph} />
                  </div>
                )}
                {showChain && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column"
                    }}
                  >
                    <WorkflowChainSurface
                      workflowId={workflowId}
                      nodeStore={nodeStore}
                    />
                  </div>
                )}
              </div>
              {active && <FloatingToolBar />}
              {active && <QueueOverlay />}
              {active && <NodeCreateBridge />}
            </KeyboardProvider>
          </ConnectableNodesProvider>
        </ContextMenuProvider>
      </ReactFlowProvider>
    </NodeContext.Provider>
  );
};

export default WorkflowEditorSurface;

/**
 * The document-level conflict banner for this workflow: lists the external
 * graph changes a merge refused and offers accept/discard per unit.
 */
const WorkflowConflictBanner: React.FC<{ workflowId: string }> = ({
  workflowId
}) => {
  const conflicts = useDocumentConflicts("workflow", workflowId);
  if (conflicts.items.length === 0) return null;
  return (
    <ConflictBanner
      conflicts={conflicts.items}
      onAccept={conflicts.accept}
      onDiscard={conflicts.discard}
      sx={{
        position: "absolute",
        top: SPACING.md,
        left: SPACING.md,
        right: SPACING.md,
        zIndex: STATUS_MESSAGE_Z_INDEX + 1,
        maxWidth: 640,
        margin: "0 auto"
      }}
    />
  );
};
