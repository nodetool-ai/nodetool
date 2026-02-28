/** @jsxImportSource @emotion/react */
import { useRef, useEffect, useMemo, memo, useState } from "react";
import {
  useReactFlow,
  Background,
  BackgroundVariant,
  ReactFlow,
  SelectionMode,
  ConnectionMode,
  useViewport,
  useUpdateNodeInternals
} from "@xyflow/react";

import useConnectionStore from "../../stores/ConnectionStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import ContextMenus from "../context_menus/ContextMenus";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode/PreviewNode";
import { OutputNode } from "../node/OutputNode";
import { CompareImagesNode } from "../node/CompareImagesNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import RerouteNode from "../node/RerouteNode";
import {
  DynamicFalSchemaNode,
  DYNAMIC_FAL_NODE_TYPE
} from "../node/DynamicFalSchemaNode";
import {
  DynamicKieSchemaNode,
  DYNAMIC_KIE_NODE_TYPE
} from "../node/DynamicKieSchemaNode";
import {
  DynamicReplicateNode,
  DYNAMIC_REPLICATE_NODE_TYPE
} from "../node/DynamicReplicateNode";
import {
  WorkflowNode,
  WORKFLOW_NODE_TYPE
} from "../node/WorkflowNode";
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
import { useProcessedEdges } from "../../hooks/useProcessedEdges";
import { useFitView } from "../../hooks/useFitView";
import { useFitNodeEvent } from "../../hooks/useFitNodeEvent";
import { MAX_ZOOM, MIN_ZOOM, ZOOMED_OUT } from "../../config/constants";
import GroupNode from "../node/GroupNode";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";
import AxisMarker from "../node_editor/AxisMarker";
import ConnectionLine from "../node_editor/ConnectionLine";
import EdgeGradientDefinitions from "../node_editor/EdgeGradientDefinitions";
import ConnectableNodes from "../context_menus/ConnectableNodes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflow } from "../../serverState/useWorkflow";
import { CircularProgress } from "@mui/material";
import { Typography } from "@mui/material";
import { DATA_TYPES } from "../../config/data_types";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore from "../../stores/StatusStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import { useReactFlowEvents } from "../../hooks/handlers/useReactFlowEvents";
import { usePaneEvents } from "../../hooks/handlers/usePaneEvents";
import { useNodeEvents } from "../../hooks/handlers/useNodeEvents";
import { useSelectionEvents } from "../../hooks/handlers/useSelectionEvents";
import { useConnectionEvents } from "../../hooks/handlers/useConnectionEvents";

const fitViewOptions = {
  maxZoom: MAX_ZOOM,
  minZoom: MIN_ZOOM,
  padding: 0.5
};

interface ReactFlowWrapperProps {
  workflowId: string;
  active: boolean;
}

import GhostNode from "./GhostNode";
import MiniMapNavigator from "./MiniMapNavigator";
import ViewportStatusIndicator from "../node_editor/ViewportStatusIndicator";
import CustomEdge from "../node_editor/CustomEdge";
import ControlEdge from "../node_editor/ControlEdge";

const ReactFlowWrapper: React.FC<ReactFlowWrapperProps> = ({
  workflowId,
  active
}) => {
  const isDarkMode = useIsDarkMode();
  const theme = useTheme();
  // Combine multiple store subscriptions into a single selector to reduce re-renders
  const {
    nodes,
    edges,
    onEdgesChange,
    onEdgeUpdate,
    shouldFitToScreen,
    setShouldFitToScreen,
    storedViewport,
    deleteEdge,
    setEdgeSelectionState
  } = useNodes(
    useMemo(
      () => (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        onEdgesChange: state.onEdgesChange,
        onEdgeUpdate: state.onEdgeUpdate,
        shouldFitToScreen: state.shouldFitToScreen,
        setShouldFitToScreen: state.setShouldFitToScreen,
        storedViewport: state.viewport,
        deleteEdge: state.deleteEdge,
        setEdgeSelectionState: state.setEdgeSelectionState
      }),
      []
    )
  );

  const [isVisible, setIsVisible] = useState(true);
  const [isSelecting] = useState(false);

  useEffect(() => {
    setIsVisible(!!storedViewport || nodes.length === 0);
  }, [workflowId, storedViewport, nodes]);

  const reactFlowInstance = useReactFlow();
  const pendingNodeType = useNodePlacementStore(
    (state) => state.pendingNodeType
  );
  const cancelPlacement = useNodePlacementStore(
    (state) => state.cancelPlacement
  );
  const placementLabel = useNodePlacementStore((state) => state.label);
  const [ghostPosition, setGhostPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const ghostRafRef = useRef<number | null>(null);
  const ghostTheme = useMemo(() => {
    const isDark = theme.palette.mode === "dark";
    return {
      textColor: isDark
        ? "rgba(226, 232, 255, 0.95)"
        : "rgba(23, 37, 84, 0.95)",
      accentColor: theme.vars.palette.primary.main,
      badgeBackground: isDark
        ? "linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(14, 165, 233, 0.22))"
        : "linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(14, 165, 233, 0.14))",
      badgeBorder: isDark
        ? "rgba(96, 165, 250, 0.65)"
        : "rgba(59, 130, 246, 0.55)",
      badgeShadow: isDark
        ? "0 14px 32px rgba(2, 6, 23, 0.38)"
        : "0 12px 26px rgba(30, 58, 138, 0.18)",
      labelBackground: isDark
        ? "rgba(8, 47, 73, 0.75)"
        : "rgba(255, 255, 255, 0.95)",
      hintColor: isDark ? "rgba(148, 163, 184, 0.9)" : "rgba(71, 85, 105, 0.9)"
    };
  }, [theme.palette.mode, theme.vars.palette.primary.main]);

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      position: "absolute" as const,
      backgroundColor: "var(--c_editor_bg_color)",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      opacity: isVisible ? 1 : 0,
      transition: "opacity 50ms 1s ease-out"
    }),
    [isVisible]
  );

  const reactFlowStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      backgroundColor: "var(--c_editor_bg_color)"
    }),
    []
  );

  const backgroundStyle = useMemo(
    () => ({
      backgroundColor: theme.vars.palette.c_editor_bg_color
    }),
    [theme.vars.palette.c_editor_bg_color]
  );

  const fitView = useFitView();
  useFitNodeEvent();

  const { handleMoveEnd, handleOnMoveStart } = useReactFlowEvents();

  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);
  const workflowExistsLocally = workflowId ? !!getNodeStore(workflowId) : false;

  const { isLoading, error } = useWorkflow(workflowId, {
    enabled: !workflowExistsLocally
  });

  const { handleOnConnect, onConnectStart, onConnectEnd } =
    useConnectionHandlers();

  const proOptions = useMemo(
    () => ({
      hideAttribution: true
    }),
    []
  );

  const connecting = useConnectionStore((state) => state.connecting);
  const updateNodeInternals = useUpdateNodeInternals();

  // Single trigger: connection drag ended or edges changed (add/remove/reconnect).
  // Wait one frame, then refresh handle positions for all nodes.
  const prevConnectingRef = useRef(connecting);
  const prevEdgeCountRef = useRef(edges.length);
  useEffect(() => {
    const dragEnded = prevConnectingRef.current && !connecting;
    const edgesChanged = prevEdgeCountRef.current !== edges.length;
    prevConnectingRef.current = connecting;
    prevEdgeCountRef.current = edges.length;
    if (dragEnded || edgesChanged) {
      const rafId = requestAnimationFrame(() => {
        const nodeIds = nodes.map((n) => n.id);
        if (nodeIds.length > 0) {
          updateNodeInternals(nodeIds);
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [connecting, edges.length, nodes, updateNodeInternals]);

  const ref = useRef<HTMLDivElement | null>(null);
  const { zoom } = useViewport();

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }

    const handleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) {
        return;
      }

      const edgeElement = (event.target as HTMLElement | null)?.closest(
        ".react-flow__edge"
      ) as HTMLElement | null;
      if (!edgeElement) {
        return;
      }

      const edgeId = edgeElement.getAttribute("data-id");
      if (!edgeId) {
        return;
      }
      deleteEdge(edgeId);
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener("auxclick", handleAuxClick);
    return () => {
      container.removeEventListener("auxclick", handleAuxClick);
    };
  }, [deleteEdge]);

  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const baseNodeTypes = useMetadataStore((state) => state.nodeTypes);
  const nodeTypes = useMemo(
    () => ({
      ...baseNodeTypes,
      "nodetool.workflows.base_node.Group": GroupNode,
      "nodetool.workflows.base_node.Comment": CommentNode,
      "nodetool.workflows.base_node.Preview": PreviewNode,
      "nodetool.workflows.base_node.Output": OutputNode,
      "nodetool.output.Output": OutputNode,
      "nodetool.compare.CompareImages": CompareImagesNode,
      "nodetool.control.Reroute": RerouteNode,
      [DYNAMIC_FAL_NODE_TYPE]: DynamicFalSchemaNode,
      [DYNAMIC_KIE_NODE_TYPE]: DynamicKieSchemaNode,
      [DYNAMIC_REPLICATE_NODE_TYPE]: DynamicReplicateNode,
      [WORKFLOW_NODE_TYPE]: WorkflowNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes]
  );

  const edgeTypes = useMemo(
    () => ({
      default: CustomEdge,
      control: ControlEdge
    }),
    []
  );

  const settings = useSettingsStore((state) => state.settings);

  const { onDrop, onDragOver } = useDropHandler();

  useEffect(() => {
    return () => {
      cancelPlacement();
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
      setGhostPosition(null);
    };
  }, [cancelPlacement]);

  useEffect(() => {
    if (!pendingNodeType) {
      setGhostPosition(null);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelPlacement();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingNodeType, cancelPlacement]);

  useEffect(() => {
    if (!pendingNodeType) {
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
      setGhostPosition(null);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const { clientX, clientY } = event;
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
      }
      ghostRafRef.current = requestAnimationFrame(() => {
        setGhostPosition({ x: clientX, y: clientY });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
    };
  }, [pendingNodeType]);

  useEffect(() => {
    if (!pendingNodeType) {
      return;
    }
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [pendingNodeType]);

  const { isConnectionValid } = useConnectionEvents();

  const { handleDoubleClick, handlePaneClick, handlePaneContextMenu } =
    usePaneEvents({
      pendingNodeType,
      placementLabel,
      reactFlowInstance
    });

  const { handleNodeContextMenu, handleNodesChange } = useNodeEvents();

  const { onEdgeContextMenu, onEdgeUpdateEnd, onEdgeUpdateStart, onEdgeClick } =
    useEdgeHandlers();

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

  const selectionEvents = useSelectionEvents({
    reactFlowInstance,
    onSelectionStartBase: onSelectionStart,
    onSelectionEndBase: onSelectionEnd,
    onSelectionDragStartBase: onSelectionDragStart,
    onSelectionDragStopBase: onSelectionDragStop
  });

  const edgeStatuses = useResultsStore((state) => state.edges);
  const nodeStatuses = useStatusStore((state) => state.statuses);
  const { processedEdges, activeGradientKeys } = useProcessedEdges({
    edges,
    nodes,
    dataTypes: DATA_TYPES,
    getMetadata,
    workflowId,
    edgeStatuses,
    nodeStatuses,
    isSelecting
  });
  const activeGradientKeysArray = useMemo(
    () => Array.from(activeGradientKeys),
    [activeGradientKeys]
  );

  // Memoize selected node IDs to avoid recalculating on every edge iteration
  const selectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of nodes) {
      if (node.selected) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [nodes]);

  // Track previous selectedNodeIds to skip edge processing when selection hasn't changed
  const prevSelectedNodeIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (isSelecting) {
      return;
    }

    if (!nodes.length || !edges.length) {
      return;
    }

    // Skip if selected node IDs haven't changed (shallow comparison of sets)
    const prevIds = prevSelectedNodeIdsRef.current;
    if (prevIds !== null && prevIds.size === selectedNodeIds.size) {
      let hasChanged = false;
      for (const id of selectedNodeIds) {
        if (!prevIds.has(id)) {
          hasChanged = true;
          break;
        }
      }
      if (!hasChanged) {
        return; // Selection hasn't changed, skip edge processing
      }
    }
    prevSelectedNodeIdsRef.current = new Set(selectedNodeIds);

    const selectionUpdates: Record<string, boolean> = {};

    for (const edge of edges) {
      const isEdgeAlreadySelected = Boolean(edge.selected);
      const nodeDrivenSelection =
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
      const shouldSelect = isEdgeAlreadySelected || nodeDrivenSelection;

      if (isEdgeAlreadySelected !== shouldSelect) {
        selectionUpdates[edge.id] = shouldSelect;
      }
    }

    if (Object.keys(selectionUpdates).length > 0) {
      setEdgeSelectionState(selectionUpdates);
    }
  }, [nodes, edges, setEdgeSelectionState, isSelecting, selectedNodeIds]);

  useEffect(() => {
    if (shouldFitToScreen) {
      fitView({ padding: 0.8 });
      setShouldFitToScreen(false);
    }
  }, [fitView, shouldFitToScreen, setShouldFitToScreen]);

  useEffect(() => {
    if (storedViewport) {
      return;
    }

    if (nodes.length > 0) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.8 });
      });
    }
  }, [nodes.length, fitView, storedViewport]);

  const snapGrid = useMemo(
    () => [settings.gridSnap, settings.gridSnap] as [number, number],
    [settings.gridSnap]
  );

  const reactFlowClasses = useMemo(() => {
    const classes = [];
    if (zoom <= ZOOMED_OUT) {
      classes.push("zoomed-out");
    }
    if (connecting) {
      classes.push("is-connecting");
    }
    return classes.join(" ");
  }, [zoom, connecting]);

  const conditionalProps = useMemo(() => {
    const props: any = {};
    if (!storedViewport) {
      props.fitView = true;
      props.fitViewOptions = fitViewOptions;
    }
    if (settings.panControls === "RMB") {
      props.selectionOnDrag = true;
    }
    return props;
  }, [storedViewport, settings.panControls]);

  if (isLoading) {
    return (
      <div className="loading-overlay">
        <CircularProgress /> Loading workflow...
      </div>
    );
  }
  if (error) {
    return (
      <div className="loading-overlay">
        <Typography variant="body1" color="error">
          {(error as Error).message}
        </Typography>
      </div>
    );
  }

  if (!active) {
    return null;
  }

  return (
    <div style={containerStyle}>
      <ReactFlow
        className={reactFlowClasses}
        colorMode={isDarkMode ? "dark" : "light"}
        style={reactFlowStyle}
        onlyRenderVisibleElements={false}
        ref={ref}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        autoPanOnNodeDrag={true}
        autoPanOnConnect={true}
        autoPanSpeed={50}
        {...conditionalProps}
        nodes={nodes}
        edges={processedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid={true}
        snapGrid={snapGrid}
        defaultViewport={storedViewport || undefined}
        onMoveEnd={handleMoveEnd}
        panOnDrag={panOnDrag}
        elevateEdgesOnSelect={true}
        connectionLineComponent={ConnectionLine}
        connectionRadius={settings.connectionSnap}
        isValidConnection={isConnectionValid}
        attributionPosition="bottom-left"
        selectNodesOnDrag={settings.selectNodesOnDrag}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDrag={onNodeDrag}
        onSelectionDragStart={selectionEvents.handleSelectionDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={selectionEvents.handleSelectionDragStop}
        onSelectionStart={selectionEvents.handleSelectionStart}
        onSelectionEnd={selectionEvents.handleSelectionEnd}
        onSelectionContextMenu={selectionEvents.handleSelectionContextMenu}
        selectionMode={settings.selectionMode as SelectionMode}
        onEdgesChange={onEdgesChange}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeClick={onEdgeClick}
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
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={handleOnMoveStart}
        onDoubleClick={handleDoubleClick}
        proOptions={proOptions}
        panActivationKeyCode=""
        deleteKeyCode={null}
      >
        <Background
          id={workflowId}
          gap={100}
          offset={4}
          size={8}
          color={theme.vars.palette.c_editor_grid_color}
          lineWidth={1}
          style={backgroundStyle}
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
      {pendingNodeType && ghostPosition && (
        <GhostNode
          position={ghostPosition}
          label={placementLabel}
          nodeType={pendingNodeType}
          theme={ghostTheme}
        />
      )}
      <MiniMapNavigator />
      <ViewportStatusIndicator />
    </div>
  );
};

export default memo(ReactFlowWrapper, isEqual);
