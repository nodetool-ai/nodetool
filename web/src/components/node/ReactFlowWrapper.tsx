/** @jsxImportSource @emotion/react */
import { useCallback, useRef, useEffect, useMemo, memo, useState } from "react";
import {
  useReactFlow,
  Node,
  Background,
  BackgroundVariant,
  ReactFlow,
  SelectionMode,
  ConnectionMode,
  useViewport
} from "@xyflow/react";

// store
import useConnectionStore from "../../stores/ConnectionStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
// components
import NodeContextMenu from "../context_menus/NodeContextMenu";
import PaneContextMenu from "../context_menus/PaneContextMenu";
import SelectionContextMenu from "../context_menus/SelectionContextMenu";
import PropertyContextMenu from "../context_menus/PropertyContextMenu";
import OutputContextMenu from "../context_menus/OutputContextMenu";
import InputContextMenu from "../context_menus/InputContextMenu";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import LoopNode from "../node/LoopNode";
//utils

//hooks
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
// constants
import { MAX_ZOOM, MIN_ZOOM } from "../../config/constants";
import GroupNode from "../node/GroupNode";
import { isEqual } from "lodash";
import ThemeNodes from "../themes/ThemeNodes";
import AxisMarker from "../node_editor/AxisMarker";
import ConnectionLine from "../node_editor/ConnectionLine";
import useSelect from "../../hooks/nodes/useSelect";
import ConnectableNodes from "../context_menus/ConnectableNodes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { CircularProgress } from "@mui/material";
import { Typography } from "@mui/material";
declare global {
  interface Window {
    __beforeUnloadListenerAdded?: boolean;
  }
}

// FIT SCREEN
const fitViewOptions = {
  maxZoom: MAX_ZOOM,
  minZoom: MIN_ZOOM,
  padding: 0.5
};

interface ReactFlowWrapperProps {
  workflowId: string;
  active: boolean;
}

// Create a new component for context menus
const ContextMenus = memo(function ContextMenus() {
  const openMenuType = useContextMenuStore((state) => state.openMenuType);

  return (
    <>
      {openMenuType === "node-context-menu" && <NodeContextMenu />}
      {openMenuType === "pane-context-menu" && <PaneContextMenu />}
      {openMenuType === "property-context-menu" && <PropertyContextMenu />}
      {openMenuType === "selection-context-menu" && <SelectionContextMenu />}
      {openMenuType === "output-context-menu" && <OutputContextMenu />}
      {openMenuType === "input-context-menu" && <InputContextMenu />}
    </>
  );
});

// Create a new component for the ReactFlow background
const ReactFlowWrapper: React.FC<ReactFlowWrapperProps> = ({
  workflowId,
  active
}) => {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onEdgeUpdate,
    shouldFitToScreen,
    setShouldFitToScreen
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    onNodesChange: state.onNodesChange,
    onEdgesChange: state.onEdgesChange,
    onEdgeUpdate: state.onEdgeUpdate,
    shouldFitToScreen: state.shouldFitToScreen,
    setShouldFitToScreen: state.setShouldFitToScreen
  }));
  const { loadingState } = useWorkflowManager((state) => ({
    loadingState: state.getLoadingState(workflowId)
  }));

  const { handleOnConnect, onConnectStart, onConnectEnd } =
    useConnectionHandlers();

  const proOptions = {
    //https://reactflow.dev/docs/guides/remove-attribution/
    hideAttribution: true
  };

  const connecting = useConnectionStore((state) => state.connecting);

  /* REACTFLOW */
  const ref = useRef<HTMLDivElement | null>(null);
  const { zoom } = useViewport();

  /* USE STORE */
  const { close: closeSelect } = useSelect();

  /* DEFINE NODE TYPES */
  const nodeTypes = useMetadataStore((state) => state.nodeTypes);
  nodeTypes["nodetool.group.Loop"] = LoopNode;
  nodeTypes["nodetool.workflows.base_node.Group"] = GroupNode;
  nodeTypes["nodetool.workflows.base_node.Comment"] = CommentNode;
  nodeTypes["nodetool.workflows.base_node.Preview"] = PreviewNode;
  nodeTypes["default"] = PlaceholderNode;

  /* SETTINGS */
  const settings = useSettingsStore((state) => state.settings);

  /* ON DROP*/
  const { onDrop, onDragOver } = useDropHandler();

  // OPEN NODE MENU
  const { openNodeMenu, closeNodeMenu, isMenuOpen } = useNodeMenuStore(
    (state) => ({
      openNodeMenu: state.openNodeMenu,
      closeNodeMenu: state.closeNodeMenu,
      isMenuOpen: state.isMenuOpen,
      selectedNodeType: state.selectedNodeType,
      documentationPosition: state.documentationPosition,
      showDocumentation: state.showDocumentation,
      closeDocumentation: state.closeDocumentation
    })
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        } else {
          openNodeMenu({
            x: e.clientX,
            y: e.clientY
          });
        }
      } else {
        closeNodeMenu();
      }
    },
    [closeNodeMenu, isMenuOpen, openNodeMenu]
  );

  // CLOSE NODE MENU
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        }
      }
    },
    [closeNodeMenu, isMenuOpen]
  );

  /* CONTEXT MENUS */
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        "",
        event.clientX,
        event.clientY,
        "node-header"
      );
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  const handlePaneContextMenu = useCallback(
    (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => {
        openContextMenu(
          "pane-context-menu",
          "",
          event.clientX,
          event.clientY,
          "react-flow__pane"
        );
      });
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      openContextMenu(
        "selection-context-menu",
        "",
        event.clientX,
        event.clientY,
        "react-flow__nodesselection"
      );
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  // ON MOVE START | DRAG PANE
  const handleOnMoveStart = useCallback(
    (event: any) => {
      // Only close menu on pan events, not zoom events
      if (event.type === "pan") {
        closeNodeMenu();
      }
    },
    [closeNodeMenu]
  );

  // ON NODES CHANGE
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      closeNodeMenu();
    },
    [onNodesChange, closeNodeMenu]
  );

  /* KEY LISTENER */
  // const { spaceKeyPressed } = useKeyPressedStore((state) => ({
  //   spaceKeyPressed: state.isKeyPressed(" ")
  // }));

  // EDGE HANDLER
  const {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateEnd,
    onEdgeUpdateStart
  } = useEdgeHandlers();

  // DRAG HANDLER
  const {
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    onSelectionStart,
    onNodeDragStart,
    onNodeDragStop,
    panOnDrag,
    onNodeDrag
  } = useDragHandlers();

  /* VIEWPORT */
  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 1.5 }), []);
  const reactFlowInstance = useReactFlow();

  const fitScreen = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView(fitViewOptions);
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

  if (loadingState?.isLoading) {
    return (
      <div className="loading-overlay">
        <CircularProgress /> Loading workflow...
      </div>
    );
  }
  if (loadingState?.error) {
    return (
      <div className="loading-overlay">
        <Typography variant="body1" color="error">
          {loadingState.error.message}
        </Typography>
      </div>
    );
  }

  return (
    <div className="reactflow-wrapper">
      <ReactFlow
        onlyRenderVisibleElements={false}
        ref={ref}
        className={
          zoom <= MIN_ZOOM
            ? "zoomed-out"
            : " " + (connecting ? "is-connecting" : "")
        }
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        autoPanOnNodeDrag={true}
        autoPanOnConnect={true}
        autoPanSpeed={50}
        fitView
        fitViewOptions={fitViewOptions}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[settings.gridSnap, settings.gridSnap]}
        defaultViewport={defaultViewport}
        panOnDrag={panOnDrag}
        {...(settings.panControls === "RMB" ? { selectionOnDrag: true } : {})}
        elevateEdgesOnSelect={true}
        connectionLineComponent={ConnectionLine}
        connectionRadius={settings.connectionSnap}
        attributionPosition="bottom-left"
        selectNodesOnDrag={settings.selectNodesOnDrag}
        onClick={handleClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDrag={onNodeDrag}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={onSelectionDragStop}
        onSelectionStart={onSelectionStart}
        onSelectionContextMenu={handleSelectionContextMenu}
        selectionMode={settings.selectionMode as SelectionMode}
        onEdgesChange={onEdgesChange}
        // TODO: fix edge mouse enter and leave
        // Performance issue when hovering over edges
        // triggering edge changes
        // onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeContextMenu={onEdgeContextMenu}
        connectionMode={ConnectionMode.Strict}
        onConnect={handleOnConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnect={onEdgeUpdate}
        onReconnectStart={onEdgeUpdateStart}
        onReconnectEnd={onEdgeUpdateEnd}
        onNodesChange={handleNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={closeSelect}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={handleOnMoveStart}
        onDoubleClick={handleDoubleClick}
        proOptions={proOptions}
        panActivationKeyCode=""
        // onSelectionChange={onSelectionChange}
        // edgeTypes={edgeTypes}
        // onNodeClick={onNodeClick}
        deleteKeyCode={["Delete", "Backspace"]}
      >
        <Background
          id={workflowId}
          gap={100}
          offset={4}
          size={8}
          color={ThemeNodes.palette.c_editor_grid_color}
          lineWidth={1}
          style={{
            backgroundColor: ThemeNodes.palette.c_editor_bg_color
          }}
          variant={BackgroundVariant.Cross}
        />
        <AxisMarker />
        <ContextMenus />
        <ConnectableNodes />
      </ReactFlow>
    </div>
  );
};

export default memo(ReactFlowWrapper, isEqual);
