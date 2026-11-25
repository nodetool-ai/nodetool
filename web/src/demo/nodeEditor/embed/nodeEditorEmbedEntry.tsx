/**
 * Node editor demo for the marketing site (web/node-editor-embed.html).
 *
 * Mounts the production `NodeEditor` over a three-node graph
 * (Text Input → Text To Image → Image To Video), with no backend. Visitors
 * can drag nodes, connect and remove edges, edit prompts, add nodes from the
 * real node menu (limited to the demo's node types) and press Run.
 *
 * Run goes through the real `WorkflowRunner.run`. `installFakeRunTransport`
 * answers it in the page: generation nodes return pre-made sample stills and
 * clips served by the marketing site under /node-editor-demo/.
 *
 * Built by `npm run build:node-editor-embed` into
 * marketing/public/embed/node-editor/, which the marketing site loads in an
 * iframe when the visitor asks for it.
 */
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ReactFlowProvider, type NodeTypes } from "@xyflow/react";
import { useColorScheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import "@xyflow/react/dist/style.css";
import "../../../styles/vars.css";
import "../../../styles/base.css";

import { queryClient } from "../../../queryClient";
import useMetadataStore from "../../../stores/MetadataStore";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import { NodeContext, useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import {
  WorkflowManagerProvider,
  useWorkflowManager
} from "../../../contexts/WorkflowManagerContext";
import TranslationProvider from "../../../contexts/TranslationProvider";
import { ConnectableNodesProvider } from "../../../providers/ConnectableNodesProvider";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";
import { MenuProvider } from "../../../providers/MenuProvider";
import KeyboardProvider from "../../../components/KeyboardProvider";
import { TRPCProvider } from "../../../trpc/Provider";
import ThemeNodetool from "../../../components/themes/ThemeNodetool";
import NodeEditor from "../../../components/node_editor/NodeEditor";
import NodeCreateBridge from "../../../components/editor/NodeCreateBridge";
import BaseNode from "../../../components/node/BaseNode";
import { createConnectabilityMatrix } from "../../../components/node_menu/typeFilterUtils";
import { EditorButton } from "../../../components/editor_ui";
import {
  Caption,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  RunWorkflowButton,
  SPACING,
  ThemeRoot
} from "../../../components/ui_primitives";
import type { NodeMetadata, Workflow } from "../../../stores/ApiTypes";

import { seedDemoAuth, seedDemoSecrets } from "../../demoEngine";
import demoNodeMetadata from "../demoNodeMetadata.json";
import { installFakeApi } from "../fakeApi";
import { installFakeRunTransport } from "../fakeRunTransport";
import { createDemoWorkflow, DEMO_WORKFLOW_ID } from "./demoWorkflow";

/** Frames narrower than this get the column layout. */
const NARROW_FRAME_PX = 640;

/** What the app does with server metadata (serverState/useMetadata.ts). */
function seedEditor(): void {
  const metadata = demoNodeMetadata as unknown as Record<string, NodeMetadata>;
  const nodeTypes: NodeTypes = {};
  for (const nodeType of Object.keys(metadata)) {
    nodeTypes[nodeType] = BaseNode;
  }
  const store = useMetadataStore.getState();
  store.setMetadata(metadata);
  store.setNodeTypes(nodeTypes);
  createConnectabilityMatrix(Object.values(metadata));
  seedDemoAuth();
  seedDemoSecrets();
}

function DemoToolbar({ onReset }: { onReset: () => void }): React.JSX.Element {
  const workflow = useNodes((state) => state.workflow);
  const run = useWebsocketRunner((state) => state.run);
  const cancel = useWebsocketRunner((state) => state.cancel);
  const runnerState = useWebsocketRunner((state) => state.state);
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const nodeStore = useNodeStoreRef();
  const isRunning =
    runnerState === "connecting" || runnerState === "connected" || runnerState === "running";

  const handleRun = useCallback(() => {
    const { nodes, edges } = nodeStore.getState();
    void run({}, workflow, nodes, edges, undefined, undefined, true);
  }, [run, workflow, nodeStore]);

  const handleAddNode = useCallback(() => {
    openNodeMenu({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      centerOnScreen: true,
      selectedPath: ["nodetool"]
    });
  }, [openNodeMenu]);

  return (
    <FlexRow
      gap={1}
      align="center"
      wrap
      sx={{
        flexShrink: 0,
        px: SPACING.md,
        py: SPACING.sm,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.default"
      }}
    >
      <RunWorkflowButton
        isRunning={isRunning}
        onRun={handleRun}
        onStop={() => void cancel()}
        showLabel
        tooltipPlacement="bottom"
      />
      <EditorButton startIcon={<AddIcon />} onClick={handleAddNode} density="compact">
        Add node
      </EditorButton>
      <EditorButton startIcon={<RestartAltIcon />} onClick={onReset} density="compact">
        Start over
      </EditorButton>
      <Caption color="secondary">
        Demo results are sample images and clips. No model runs.
      </Caption>
    </FlexRow>
  );
}

function DemoEditor(): React.JSX.Element {
  const addWorkflow = useWorkflowManager((state) => state.addWorkflow);
  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const setCurrentWorkflowId = useWorkflowManager((state) => state.setCurrentWorkflowId);
  const nodeStore = useWorkflowManager((state) => state.getNodeStore(DEMO_WORKFLOW_ID));
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const layout = window.innerWidth < NARROW_FRAME_PX ? "column" : "row";
    const workflow: Workflow = createDemoWorkflow(layout);
    addWorkflow(workflow);
    setCurrentWorkflowId(workflow.id);
    return () => removeWorkflow(workflow.id);
  }, [addWorkflow, removeWorkflow, setCurrentWorkflowId, generation]);

  const handleReset = useCallback(() => setGeneration((value) => value + 1), []);

  if (!nodeStore) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  return (
    <NodeContext.Provider value={nodeStore}>
      <ReactFlowProvider key={generation}>
        <ContextMenuProvider>
          <ConnectableNodesProvider>
            <KeyboardProvider>
              <FlexColumn fullWidth fullHeight>
                <DemoToolbar onReset={handleReset} />
                <FlexColumn sx={{ flex: "1 1 0", minHeight: 0, position: "relative" }}>
                  <NodeEditor workflowId={DEMO_WORKFLOW_ID} active />
                </FlexColumn>
                <NodeCreateBridge />
              </FlexColumn>
            </KeyboardProvider>
          </ConnectableNodesProvider>
        </ContextMenuProvider>
      </ReactFlowProvider>
    </NodeContext.Provider>
  );
}

/** The marketing site is dark, so the editor is too, whatever the OS says. */
function DarkMode(): null {
  const { setMode } = useColorScheme();
  useEffect(() => setMode("dark"), [setMode]);
  return null;
}

function App(): React.JSX.Element {
  useEffect(() => installFakeRunTransport(), []);
  return (
    <MemoryRouter>
      <TranslationProvider>
        <TRPCProvider>
          <ThemeRoot theme={ThemeNodetool}>
            <DarkMode />
            <MenuProvider>
              <WorkflowManagerProvider queryClient={queryClient}>
                <DemoEditor />
              </WorkflowManagerProvider>
            </MenuProvider>
          </ThemeRoot>
        </TRPCProvider>
      </TranslationProvider>
    </MemoryRouter>
  );
}

installFakeApi();
seedEditor();
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
