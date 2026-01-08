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
} from "@xyflow/react";

import useConnectionStore from "../../stores/ConnectionStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import ContextMenus from "../context_menus/ContextMenus";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode/PreviewNode";
import { CompareImagesNode } from "../node/CompareImagesNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import RerouteNode from "../node/RerouteNode";
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

const ReactFlowWrapper: React.FC<ReactFlowWrapperProps> = ({
  workflowId,
  active
}) => {
  const isDarkMode = useIsDarkMode();
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const onEdgesChange = useNodes((state) => state.onEdgesChange);
  const onEdgeUpdate = useNodes((state) => state.onEdgeUpdate);
  const shouldFitToScreen = useNodes((state) => state.shouldFitToScreen);
  const setShouldFitToScreen = useNodes((state) => state.setShouldFitToScreen);
  const storedViewport = useNodes((state) => state.viewport);
  const deleteEdge = useNodes((state) => state.deleteEdge);
  const setEdgeSelectionState = useNodes(
    (state) => state.setEdgeSelectionState
  );

  const [isVisible, setIsVisible] = useState(true);
  const [isSelecting] = useState(false);

  useEffect(() => {
    setIsVisible(!!storedViewport || nodes.length === 0);
  }, [workflowId, storedViewport, nodes.length]);

  const reactFlowInstance = useReactFlow();
  const pendingNodeType = useNodePlacementStore((state) => state.pendingNodeType);
  const cancelPlacement = useNodePlacementStore((state) => state.cancelPlacement);
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
      "nodetool.compare.CompareImages": CompareImagesNode,
      "nodetool.control.Reroute": RerouteNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes]
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

  const {
    handleDoubleClick,
    handlePaneClick,
    handlePaneContextMenu
  } = usePaneEvents({
    pendingNodeType,
    placementLabel,
    reactFlowInstance
  });

  const {
    handleNodeContextMenu,
    handleNodesChange
  } = useNodeEvents();

  const {
    onEdgeContextMenu,
    onEdgeUpdateEnd,
    onEdgeUpdateStart,
    onEdgeClick
  } = useEdgeHandlers();

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
  const { processedEdges, activeGradientKeys } = useProcessedEdges({
    edges,
    nodes,
    dataTypes: DATA_TYPES,
    getMetadata,
    workflowId,
    edgeStatuses,
    isSelecting
  });
  const activeGradientKeysArray = useMemo(
    () => Array.from(activeGradientKeys),
    [activeGradientKeys]
  );

  useEffect(() => {
    if (isSelecting) {
      return;
    }

    if (!nodes.length || !edges.length) {
      return;
    }

    const selectedIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id)
    );

    const selectionUpdates: Record<string, boolean> = {};

    for (const edge of edges) {
      const isEdgeAlreadySelected = Boolean(edge.selected);
      const nodeDrivenSelection =
        selectedIds.has(edge.source) || selectedIds.has(edge.target);
      const shouldSelect = isEdgeAlreadySelected || nodeDrivenSelection;

      if (isEdgeAlreadySelected !== shouldSelect) {
        selectionUpdates[edge.id] = shouldSelect;
      }
    }

    if (Object.keys(selectionUpdates).length > 0) {
      setEdgeSelectionState(selectionUpdates);
    }
  }, [nodes, edges, setEdgeSelectionState, isSelecting]);

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
    if (zoom <= ZOOMED_OUT) { classes.push("zoomed-out"); }
    if (connecting) { classes.push("is-connecting"); }
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
        deleteKeyCode={["Delete", "Backspace"]}
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
    </div>
  );
};

export default memo(ReactFlowWrapper, isEqual);
