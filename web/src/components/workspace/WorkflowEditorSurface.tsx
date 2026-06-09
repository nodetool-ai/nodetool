/** @jsxImportSource @emotion/react */
import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import NodeEditor from "../node_editor/NodeEditor";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  tabId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import KeyboardProvider from "../KeyboardProvider";
import FloatingToolBar from "../panels/FloatingToolBar";
import QueueOverlay from "../panels/QueueOverlay";
import StatusMessage from "../panels/StatusMessage";
import NodeCreateBridge from "../editor/NodeCreateBridge";
import { FlexColumn, LoadingSpinner } from "../ui_primitives";

interface WorkflowEditorSurfaceProps {
  workflowId: string;
  active: boolean;
}

/**
 * The Edit surface for a workflow tab: the ReactFlow node editor with its
 * provider stack and editor overlays, scoped to a single workflow. Extracted
 * from TabsNodeEditor so the workspace shell can host one workflow per tab.
 * The per-workflow NodeStore stays owned by the WorkflowManager; this surface
 * just looks it up (and triggers a fetch when a restored tab has none yet).
 */
const WorkflowEditorSurface = ({
  workflowId,
  active
}: WorkflowEditorSurfaceProps) => {
  const nodeStore = useWorkflowManager((state) => state.getNodeStore(workflowId));
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const [missing, setMissing] = useState(false);

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
                    zIndex: 10000
                  }}
                >
                  <StatusMessage />
                </div>
              )}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                  width: "100%",
                  height: "100%"
                }}
              >
                <NodeEditor workflowId={workflowId} active={active} />
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
