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
  useViewport,
  Connection,
  Viewport
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
import useSelect from "../../hooks/nodes/useSelect";
import { useProcessedEdges } from "../../hooks/useProcessedEdges";
import { useFitView } from "../../hooks/useFitView";
// constants
import { MAX_ZOOM, MIN_ZOOM, ZOOMED_OUT } from "../../config/constants";
import GroupNode from "../node/GroupNode";
import { isEqual } from "lodash";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AxisMarker from "../node_editor/AxisMarker";
import ConnectionLine from "../node_editor/ConnectionLine";
import EdgeGradientDefinitions from "../node_editor/EdgeGradientDefinitions";
import ConnectableNodes from "../context_menus/ConnectableNodes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { CircularProgress } from "@mui/material";
import { Typography } from "@mui/material";
import { DATA_TYPES } from "../../config/data_types";
import { useColorScheme } from "@mui/material/styles";

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
  const { mode } = useColorScheme();
  const theme = useTheme();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onEdgeUpdate,
    shouldFitToScreen,
    setShouldFitToScreen,
    validateConnection,
    findNode,
    viewport: storedViewport,
    setViewport
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    onNodesChange: state.onNodesChange,
    onEdgesChange: state.onEdgesChange,
    onEdgeUpdate: state.onEdgeUpdate,
    shouldFitToScreen: state.shouldFitToScreen,
    setShouldFitToScreen: state.setShouldFitToScreen,
    validateConnection: state.validateConnection,
    findNode: state.findNode,
    viewport: state.viewport,
    setViewport: state.setViewport
  }));

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // When the workflow changes, determine initial visibility.
    // It's visible immediately if a viewport is already stored.
    setIsVisible(!!storedViewport || nodes.length === 0);
  }, [workflowId, storedViewport, nodes.length]);

  const reactFlowInstance = useReactFlow();

  const fitView = useFitView();

  // When the user stops moving the canvas, save the new viewport.
  const handleMoveEnd = useCallback(
    (event: any, viewport: Viewport) => {
      setViewport(viewport);
    },
    [setViewport]
  );

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
  const { getNode } = useReactFlow();

  /* USE STORE */
  const { close: closeSelect } = useSelect();
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  /* DEFINE NODE TYPES */
  const nodeTypes = useMetadataStore((state) => state.nodeTypes);
  nodeTypes["nodetool.group.Loop"] = LoopNode;
  nodeTypes["nodetool.workflows.base_node.Group"] = GroupNode;
  nodeTypes["nodetool.workflows.base_node.Comment"] = CommentNode;
  nodeTypes["nodetool.workflows.base_node.Preview"] = PreviewNode;
  nodeTypes["default"] = PlaceholderNode;
  // debug removed: too noisy

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
    (changes: any[]) => {
      onNodesChange(changes);
      // Do not auto-close the Node Menu on node internals/position updates.
      // Pane clicks, panning, or explicit actions will close it elsewhere.
    },
    [onNodesChange]
  );

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
    onNodeDrag,
    onSelectionEnd
  } = useDragHandlers();

  const { processedEdges, activeGradientKeys } = useProcessedEdges({
    edges,
    nodes,
    getNode,
    dataTypes: DATA_TYPES,
    getMetadata
  });
  const activeGradientKeysArray = useMemo(
    () => Array.from(activeGradientKeys),
    [activeGradientKeys]
  );

  useEffect(() => {
    if (shouldFitToScreen) {
      fitView({ padding: 0.8 });
      setShouldFitToScreen(false);
    }
  }, [fitView, shouldFitToScreen, setShouldFitToScreen]);

  /*
   * Perform an automatic `fitView` on mount ONLY when the workflow does **not**
   * have a stored viewport yet. This ensures that after the user has panned or
   * zoomed a workflow, switching tabs will restore their last viewport instead
   * of re-centring the canvas every time.
   */
  useEffect(() => {
    if (storedViewport) {
      // A viewport was already saved – respect it and make the canvas visible
      // immediately without any additional fitting.
      return;
    }

    // Without a saved viewport, fit the view once the nodes are rendered.
    if (nodes.length > 0) {
      // Use requestAnimationFrame for smoother rendering
      requestAnimationFrame(() => {
        fitView({ padding: 0.8 });
      });
    }
  }, [nodes.length, fitView, storedViewport]);

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

  if (!active) {
    return null;
  }

  const reactFlowClasses = [
    mode,
    zoom <= ZOOMED_OUT ? "zoomed-out" : "",
    connecting ? "is-connecting" : ""
  ]
    .join(" ")
    .trim();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        backgroundColor: "var(--c_editor_bg_color)",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        opacity: isVisible ? 1 : 0,
        transition: "opacity 50ms 1s ease-out"
      }}
    >
      <ReactFlow
        className={reactFlowClasses}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "var(--c_editor_bg_color)"
        }}
        onlyRenderVisibleElements={false}
        ref={ref}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        autoPanOnNodeDrag={true}
        autoPanOnConnect={true}
        autoPanSpeed={50}
        {...(!storedViewport ? { fitView: true, fitViewOptions } : {})}
        nodes={nodes}
        edges={processedEdges}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[settings.gridSnap, settings.gridSnap]}
        defaultViewport={storedViewport || undefined}
        onMoveEnd={handleMoveEnd}
        panOnDrag={panOnDrag}
        {...(settings.panControls === "RMB" ? { selectionOnDrag: true } : {})}
        elevateEdgesOnSelect={true}
        connectionLineComponent={ConnectionLine}
        connectionRadius={settings.connectionSnap}
        isValidConnection={(connection) => {
          if (!connection.source || !connection.target) return true;
          const src = findNode(connection.source);
          const tgt = findNode(connection.target);
          if (!src || !tgt) return false;
          return validateConnection(connection as Connection, src, tgt);
        }}
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
        onSelectionEnd={onSelectionEnd}
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
        deleteKeyCode={["Delete", "Backspace"]}
      >
        <Background
          id={workflowId}
          gap={100}
          offset={4}
          size={8}
          color={theme.vars.palette.c_editor_grid_color}
          lineWidth={1}
          style={{
            backgroundColor: theme.vars.palette.c_editor_bg_color
          }}
          variant={BackgroundVariant.Cross}
        />
        <AxisMarker />
        <ContextMenus />
        <ConnectableNodes />
        <EdgeGradientDefinitions
          dataTypes={DATA_TYPES}
          activeGradientKeys={activeGradientKeysArray}
        />
      </ReactFlow>
    </div>
  );
};

export default memo(ReactFlowWrapper, isEqual);
