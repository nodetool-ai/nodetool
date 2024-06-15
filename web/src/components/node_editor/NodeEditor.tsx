/** @jsxImportSource @emotion/react */
import { useCallback, useState, useRef, useEffect } from "react";
import ReactFlow, {
  useStore,
  useReactFlow,
  Node,
  Background,
  BackgroundVariant,
  FitViewOptions,
  useOnSelectionChange,
  Edge,
  Connection,
  SelectionMode,
  ConnectionMode
} from "reactflow";

import { CircularProgress, Grid } from "@mui/material";
//store
import {
  NodeStore,
  useNodeStore,
  useTemporalStore
} from "../../stores/NodeStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useMetadata, useNodeTypes } from "../../serverState/useMetadata";
import useConnectionStore from "../../stores/ConnectionStore";
import { HistoryManager } from "../../HistoryManager";
import { useSettingsStore } from "../../stores/SettingsStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import useSessionStateStore from "../../stores/SessionStateStore";
//components
import CommandMenu from "../menus/CommandMenu";
import ConnectionLine from "./ConnectionLine";
import NodeContextMenu from "../context_menus/NodeContextMenu";
import PaneContextMenu from "../context_menus/PaneContextMenu";
import SelectionContextMenu from "../context_menus/SelectionContextMenu";
import PropertyContextMenu from "../context_menus/PropertyContextMenu";
import OutputContextMenu from "../context_menus/OutputContextMenu";
import InputContextMenu from "../context_menus/InputContextMenu";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
//utils
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
import { getMousePosition } from "../../utils/MousePosition";
//css
import "reactflow/dist/style.css";
import "../../styles/node_editor.css";
import "../../styles/node_editor_handle_edge_tooltip.css";
//hooks
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
import { useHotkeys } from "react-hotkeys-hook";
//router
import AxisMarker from "./AxisMarker";
import { generateCSS } from "../themes/GenerateCSS";
import { MAX_ZOOM, MIN_ZOOM } from "../../config/constants";
import LoopNode from "../node/LoopNode";

declare global {
  interface Window {
    __beforeUnloadListenerAdded?: boolean;
  }
}

const NodeEditor: React.FC<unknown> = () => {
  const nodes = useNodeStore((state) => state.nodes);
  const edges = useNodeStore((state) => state.edges);
  const onConnect = useNodeStore((state) => state.onConnect);
  const onNodesChange = useNodeStore((state) => state.onNodesChange);
  const onEdgesChange = useNodeStore((state) => state.onEdgesChange);
  const onEdgeUpdate = useNodeStore((state) => state.onEdgeUpdate);
  const updateNode = useNodeStore((state) => state.updateNodeData);

  const triggerOnConnect = (connection: Connection) => {
    onConnect(connection);
    handleOnConnect(connection);
  };

  const { closeDescription } = useNodeMenuStore();
  const { connecting } = useConnectionStore();

  /* REACTFLOW */
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const reactFlowInstance = useReactFlow();

  /* USE STORE */
  const { data: queryMetadata, isLoading: loadingMetadata } = useMetadata();
  const metadata = queryMetadata?.metadata;
  const nodeTypes = useNodeTypes();
  const { uploadAsset, isUploading } = useAssetUpload();
  const nodeHistory: HistoryManager = useTemporalStore((state) => state);
  const { shouldFitToScreen, setShouldFitToScreen } = useWorkflowStore(
    (state: any) => state
  );

  /* CLOSE WINDOW */
  const addBeforeUnloadListener = () => {
    if (window.__beforeUnloadListenerAdded) {
      return;
    }
    window.addEventListener("beforeunload", (event) => {
      if (!window.location.pathname.includes("editor")) {
        return;
      }
      const workflowIsDirty = useNodeStore.getState().workflowIsDirty;
      if (!workflowIsDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
      return "";
    });
    window.__beforeUnloadListenerAdded = true;
  };
  addBeforeUnloadListener();

  /* DEFINE NODE TYPES */
  nodeTypes["nodetool.group.Loop"] = LoopNode;
  nodeTypes["nodetool.workflows.base_node.Comment"] = CommentNode;
  nodeTypes["nodetool.workflows.base_node.Preview"] = PreviewNode;
  nodeTypes["default"] = PlaceholderNode;

  /* STATE */
  const [openCommandMenu, setOpenCommandMenu] = useState(false);

  /* UTILS */
  const { handleCopy, handlePaste } = useCopyPaste();
  const alignNodes = useAlignNodes();
  const selectedNodeIds = useSessionStateStore(
    (state) => state.selectedNodeIds
  );
  const setSelectedNodes = useSessionStateStore(
    (state) => state.setSelectedNodes
  );

  const duplicateNodes = useDuplicateNodes();

  // UPDATE SELECTED NODES in SessionStateStore
  useOnSelectionChange({
    onChange: ({ nodes }) => {
      setSelectedNodes(nodes);
    }
  });

  /* DUPLICATE SELECTION */
  const handleDuplicate = useCallback(() => {
    if (selectedNodeIds.length) duplicateNodes(selectedNodeIds);
  }, [selectedNodeIds, duplicateNodes]);

  /* SETTINGS */
  const settings = useSettingsStore((state) => state.settings);

  /* ON DROP*/
  const { onDrop } = useDropHandler();

  /* HISTORY */
  const history: HistoryManager = useTemporalStore((state) => state);

  /* LOADING*/
  const showLoading = loadingMetadata || metadata?.length === 0;

  // OPEN NODE MENU
  const { openNodeMenu, closeNodeMenu, isMenuOpen, isDescriptionOpen } =
    useNodeMenuStore();

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        } else {
          openNodeMenu(e.clientX, e.clientY);
        }
        if (isDescriptionOpen) {
          closeDescription();
        }
      } else {
        closeNodeMenu();
      }
    },
    [
      closeDescription,
      closeNodeMenu,
      isDescriptionOpen,
      isMenuOpen,
      openNodeMenu
    ]
  );
  // CLOSE NODE MENU
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        }
        if (isDescriptionOpen) {
          closeDescription();
        }
      }
    },
    [closeDescription, closeNodeMenu, isDescriptionOpen, isMenuOpen]
  );

  /* CONTEXT MENUS */
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        node.id,
        event.clientX,
        event.clientY,
        "node-header"
      );
    },
    [openContextMenu]
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => {
        openContextMenu(
          "pane-context-menu",
          nodes.length > 0 ? nodes[0].id : "",
          event.clientX,
          event.clientY,
          "react-flow__pane"
        );
      });
    },
    [nodes, openContextMenu]
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      openContextMenu(
        "selection-context-menu",
        nodes[0].id,
        event.clientX,
        event.clientY,
        "react-flow__nodesselection"
      );
    },
    [nodes, openContextMenu]
  );

  // ON MOVE START | DRAG PANE
  const handleOnMoveStart = () => {
    // This also triggers on click, which will mess up the state of isMenuOpen
    // closeNodeMenu();
  };
  // ON NODES CHANGE
  const handleNodesChange = (changes: any) => {
    onNodesChange(changes);
    closeNodeMenu();
  };

  /* KEY LISTENER */
  // align
  useHotkeys("space+a", () => {
    alignNodes({ arrangeSpacing: true });
  });
  useHotkeys("a", () => {
    alignNodes({ arrangeSpacing: false });
  });
  useHotkeys("Meta+a", () => alignNodes({ arrangeSpacing: true }));
  // copy paste
  useHotkeys("Shift+c", () => handleCopy());
  useHotkeys("Shift+v", () => handlePaste());
  // duplicate
  useHotkeys("Space+d", handleDuplicate);
  // history
  useHotkeys("Control+z", () => nodeHistory.undo());
  useHotkeys("Control+Shift+z", () => nodeHistory.redo());
  useHotkeys("Meta+z", () => nodeHistory.undo());
  useHotkeys("Meta+Shift+z", () => nodeHistory.redo());
  // cmd menu
  useHotkeys("Alt+k", () => setOpenCommandMenu(true));
  useHotkeys("Meta+k", () => setOpenCommandMenu(true));
  // node menu
  useHotkeys("Control+Space", () =>
    openNodeMenu(getMousePosition().x, getMousePosition().y)
  );

  const setExplicitSave = useNodeStore(
    (state: NodeStore) => state.setExplicitSave
  );

  // RESUME HISTORY
  const resumeHistoryAndSave = useCallback(() => {
    setExplicitSave(true);
    history.resume();
    setExplicitSave(false);
  }, [history, setExplicitSave]);

  // EDGE HANDLER
  const {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateEnd,
    onEdgeUpdateStart
  } = useEdgeHandlers(resumeHistoryAndSave);

  // DRAG HANDLER
  const {
    onSelectionDragStart,
    onSelectionDragStop,
    onSelectionStart,
    onSelectionEnd,
    onNodeDragStart,
    onNodeDragStop,
    panOnDrag,
    onNodeDrag,
    onDragOver
  } = useDragHandlers(resumeHistoryAndSave);

  const invalidateResults = useNodeStore((state) => state.invalidateResults);

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      edges.forEach((edge) => {
        invalidateResults(edge.target);
      });
    },
    [invalidateResults]
  );

  /* COLLAPSE NODE */
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const clickedElement = event.target as HTMLElement;
      if (clickedElement.classList.contains("node-title")) {
        updateNode(node.id, {
          properties: { ...node.data.properties },
          workflow_id: node.data.workflow_id || "",
          collapsed: !node.data.collapsed
        });
      }
    },
    [updateNode]
  );

  const { handleOnConnect, onConnectStart, onConnectEnd } =
    useConnectionHandlers();
  /* OPTIONS */
  const proOptions = {
    //https://reactflow.dev/docs/guides/remove-attribution/
    hideAttribution: true
  };

  /* VIEWPORT */
  const currentZoom = useStore((state) => state.transform[2]);
  const defaultViewport = { x: 0, y: 0, zoom: 1.5 };

  /* ZOOM BOUNDS */
  // const isMaxZoom = currentZoom === MAX_ZOOM;
  const isMinZoom = currentZoom === MIN_ZOOM;

  // FIT SCREEN
  const fitViewOptions: FitViewOptions = {
    maxZoom: MAX_ZOOM,
    minZoom: MIN_ZOOM,
    padding: 0.6
  };

  const fitScreen = useCallback(() => {
    const fitOptions: FitViewOptions = {
      maxZoom: 2,
      minZoom: 0.5,
      padding: 0.6
    };

    if (reactFlowInstance) {
      reactFlowInstance.fitView(fitOptions);
      setShouldFitToScreen(false);
    }
  }, [reactFlowInstance, setShouldFitToScreen]);

  useEffect(() => {
    if (shouldFitToScreen) {
      requestAnimationFrame(() => {
        fitScreen();
      });
    }
  }, [fitScreen, shouldFitToScreen]);

  // INIT
  const handleOnInit = useCallback(() => {
    setTimeout(() => {
      fitScreen();
    }, 10);
  }, [fitScreen]);

  // LOADING OVERLAY
  if (showLoading) {
    return (
      <div className="loading-overlay">
        <CircularProgress size={48} style={{ margin: "auto" }} />
      </div>
    );
  }

  return (
    <>
      <CommandMenu
        open={openCommandMenu}
        setOpen={setOpenCommandMenu}
        undo={nodeHistory.undo}
        redo={nodeHistory.redo}
      />
      <div className="node-editor" css={generateCSS}>
        <Grid
          container
          spacing={2}
          margin={2}
          sx={{
            margin: "8px",
            height: "calc(100vh - 80px)",
            width: "calc(100vw - 10px)",
            overflow: "hidden"
          }}
        >
          {isUploading && (
            <div className="loading-overlay">
              <CircularProgress />
            </div>
          )}
          <div className="reactflow-wrapper" ref={reactFlowWrapper}>
            <ReactFlow
              ref={ref}
              className={
                isMinZoom
                  ? "zoomed-out"
                  : " " + (connecting ? "is-connecting" : "")
              }
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              zoomOnDoubleClick={false}
              fitView
              fitViewOptions={fitViewOptions}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              snapToGrid={true}
              snapGrid={[settings.gridSnap, settings.gridSnap]}
              defaultViewport={defaultViewport}
              panOnDrag={panOnDrag}
              {...(settings.panControls === "RMB"
                ? { selectionOnDrag: true }
                : {})}
              elevateEdgesOnSelect={true}
              connectionLineComponent={ConnectionLine}
              // edgeTypes={edgeTypes}
              connectionRadius={settings.connectionSnap}
              attributionPosition="bottom-left"
              selectNodesOnDrag={false}
              onClick={handleClick}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeDrag={onNodeDrag}
              onSelectionDragStart={onSelectionDragStart}
              onSelectionDragStop={onSelectionDragStop}
              onSelectionStart={onSelectionStart}
              onSelectionEnd={onSelectionEnd}
              onSelectionContextMenu={handleSelectionContextMenu}
              selectionMode={settings.selectionMode as SelectionMode}
              onEdgesChange={onEdgesChange}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onEdgeContextMenu={onEdgeContextMenu}
              connectionMode={ConnectionMode.Strict}
              onConnect={triggerOnConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onEdgeUpdate={onEdgeUpdate}
              onEdgeUpdateStart={onEdgeUpdateStart}
              onEdgeUpdateEnd={onEdgeUpdateEnd}
              onEdgesDelete={onEdgesDelete}
              onNodesChange={handleNodesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              onNodeContextMenu={handleNodeContextMenu}
              onPaneContextMenu={handlePaneContextMenu}
              // onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onMoveStart={handleOnMoveStart}
              onDoubleClick={handleDoubleClick}
              proOptions={proOptions}
              onInit={handleOnInit}
              deleteKeyCode={["Delete"]}
            >
              <Background
                id="1"
                gap={100}
                offset={0.15}
                size={8}
                color="#333"
                lineWidth={1}
                style={{ backgroundColor: "rgb(122, 122, 120)" }}
                variant={BackgroundVariant.Cross}
              />
              {reactFlowInstance && <AxisMarker />}

              <NodeContextMenu />
              <PaneContextMenu />
              <PropertyContextMenu />
              <SelectionContextMenu />
              <OutputContextMenu />
              <InputContextMenu />
            </ReactFlow>
          </div>
        </Grid>
      </div>
    </>
  );
};
export default NodeEditor;
