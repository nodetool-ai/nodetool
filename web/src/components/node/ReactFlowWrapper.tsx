/** @jsxImportSource @emotion/react */
import { useCallback, useRef, useEffect, useMemo, memo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
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
import useContextMenu from "../../stores/ContextMenuStore";
// components
import NodeContextMenu from "../context_menus/NodeContextMenu";
import PaneContextMenu from "../context_menus/PaneContextMenu";
import SelectionContextMenu from "../context_menus/SelectionContextMenu";
import PropertyContextMenu from "../context_menus/PropertyContextMenu";
import OutputContextMenu from "../context_menus/OutputContextMenu";
import InputContextMenu from "../context_menus/InputContextMenu";
import EdgeContextMenu from "../context_menus/EdgeContextMenu";
import ConnectionMatchMenu from "../context_menus/ConnectionMatchMenu";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode/PreviewNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import RerouteNode from "../node/RerouteNode";
//utils

//hooks
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
import useSelect from "../../hooks/nodes/useSelect";
import { useProcessedEdges } from "../../hooks/useProcessedEdges";
import { useFitView } from "../../hooks/useFitView";
import { useFitNodeEvent } from "../../hooks/useFitNodeEvent";
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
import { useWorkflow } from "../../serverState/useWorkflow";
import { CircularProgress } from "@mui/material";
import { Typography } from "@mui/material";
import { DATA_TYPES } from "../../config/data_types";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import useResultsStore from "../../stores/ResultsStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import { getMousePosition } from "../../utils/MousePosition";
import {
  getSelectionRect,
  getNodesWithinSelection
} from "../../utils/selectionBounds";

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
  const { openMenuType } = useContextMenu();

  return (
    <>
      {openMenuType === "node-context-menu" && <NodeContextMenu />}
      {openMenuType === "pane-context-menu" && <PaneContextMenu />}
      {openMenuType === "property-context-menu" && <PropertyContextMenu />}
      {openMenuType === "selection-context-menu" && <SelectionContextMenu />}
      {openMenuType === "output-context-menu" && <OutputContextMenu />}
      {openMenuType === "input-context-menu" && <InputContextMenu />}
      {openMenuType === "edge-context-menu" && <EdgeContextMenu />}
      {openMenuType === "connection-match-menu" && <ConnectionMatchMenu />}
    </>
  );
});

// Create a new component for the ReactFlow background
const ReactFlowWrapper: React.FC<ReactFlowWrapperProps> = ({
  workflowId,
  active
}) => {
  const isDarkMode = useIsDarkMode();
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const onNodesChange = useNodes((state) => state.onNodesChange);
  const onEdgesChange = useNodes((state) => state.onEdgesChange);
  const onEdgeUpdate = useNodes((state) => state.onEdgeUpdate);
  const shouldFitToScreen = useNodes((state) => state.shouldFitToScreen);
  const setShouldFitToScreen = useNodes((state) => state.setShouldFitToScreen);
  const validateConnection = useNodes((state) => state.validateConnection);
  const findNode = useNodes((state) => state.findNode);
  const storedViewport = useNodes((state) => state.viewport);
  const setViewport = useNodes((state) => state.setViewport);
  const createNode = useNodes((state) => state.createNode);
  const addNode = useNodes((state) => state.addNode);
  const deleteEdge = useNodes((state) => state.deleteEdge);
  const setEdgeSelectionState = useNodes(
    (state) => state.setEdgeSelectionState
  );
  const updateNode = useNodes((state) => state.updateNode);

  const [isVisible, setIsVisible] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    // When the workflow changes, determine initial visibility.
    // It's visible immediately if a viewport is already stored.
    setIsVisible(!!storedViewport || nodes.length === 0);
  }, [workflowId, storedViewport, nodes.length]);

  const reactFlowInstance = useReactFlow();
  const { pendingNodeType, cancelPlacement, placementLabel } =
    useNodePlacementStore((state) => ({
      pendingNodeType: state.pendingNodeType,
      cancelPlacement: state.cancelPlacement,
      placementLabel: state.label
    }));
  const [ghostPosition, setGhostPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const ghostRafRef = useRef<number | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEndRef = useRef<{ x: number; y: number } | null>(null);
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

  const fitView = useFitView();
  useFitNodeEvent();

  // When the user stops moving the canvas, save the new viewport.
  const handleMoveEnd = useCallback(
    (event: any, viewport: Viewport) => {
      setViewport(viewport);
    },
    [setViewport]
  );

  const { isLoading, error } = useWorkflow(workflowId);

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

      console.log("[ReactFlowWrapper] middle click delete edge", { edgeId });
      deleteEdge(edgeId);
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener("auxclick", handleAuxClick);
    return () => {
      container.removeEventListener("auxclick", handleAuxClick);
    };
  }, [deleteEdge]);

  /* USE STORE */
  const { close: closeSelect } = useSelect();
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  /* DEFINE NODE TYPES */
  const nodeTypes = useMetadataStore((state) => state.nodeTypes);
  nodeTypes["nodetool.workflows.base_node.Group"] = GroupNode;
  nodeTypes["nodetool.workflows.base_node.Comment"] = CommentNode;
  nodeTypes["nodetool.workflows.base_node.Preview"] = PreviewNode;
  nodeTypes["nodetool.control.Reroute"] = RerouteNode;
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

  // CLOSE NODE MENU / PLACE PENDING NODE
  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (pendingNodeType) {
        event.preventDefault();
        event.stopPropagation();
        const metadata = getMetadata(pendingNodeType);
        if (!metadata) {
          console.warn(
            `Metadata not found while placing node type: ${pendingNodeType}`
          );
          cancelPlacement();
          return;
        }
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        });
        const newNode = createNode(metadata, position);
        newNode.selected = true;
        addNode(newNode);
        cancelPlacement();
        if (isMenuOpen) {
          closeNodeMenu();
        }
        closeSelect();
        return;
      }

      if (isMenuOpen) {
        closeNodeMenu();
      }
      closeSelect();
    },
    [
      pendingNodeType,
      getMetadata,
      reactFlowInstance,
      createNode,
      addNode,
      cancelPlacement,
      isMenuOpen,
      closeNodeMenu,
      closeSelect
    ]
  );

  /* CONTEXT MENUS */
  const { openContextMenu } = useContextMenu();
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
      event.stopPropagation();
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
    onEdgeUpdateStart,
    onEdgeClick
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

  const projectMouseEventToFlow = useCallback(
    (event?: { clientX?: number; clientY?: number } | null) => {
      const fallback = getMousePosition();
      const x = typeof event?.clientX === "number" ? event.clientX : fallback.x;
      const y = typeof event?.clientY === "number" ? event.clientY : fallback.y;
      return reactFlowInstance.screenToFlowPosition({ x, y });
    },
    [reactFlowInstance]
  );

  const handleSelectionDragStart = useCallback(
    (event: any, nodes: any[]) => {
      setIsSelecting(true);
      onSelectionDragStart(event, nodes);
    },
    [onSelectionDragStart]
  );

  const handleSelectionDrag = useCallback(
    (event: ReactMouseEvent, nodesArg: any[]) => {
      selectionEndRef.current = projectMouseEventToFlow(event);
      onSelectionDrag(event, nodesArg);
    },
    [onSelectionDrag, projectMouseEventToFlow]
  );

  const handleSelectionDragStop = useCallback(
    (event: any, nodes: any[]) => {
      onSelectionDragStop(event, nodes);
      setIsSelecting(false);
    },
    [onSelectionDragStop]
  );

  const resetSelectionTracking = useCallback(() => {
    selectionStartRef.current = null;
    selectionEndRef.current = null;
  }, []);

  const selectGroupsWithinSelection = useCallback(() => {
    const selectionRect = getSelectionRect(
      selectionStartRef.current,
      selectionEndRef.current
    );
    if (!selectionRect) {
      return;
    }

    const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";
    const intersectingGroups = getNodesWithinSelection(
      reactFlowInstance,
      selectionRect,
      (node) => (node.type || node.data?.originalType) === GROUP_NODE_TYPE
    );

    intersectingGroups.forEach((node) => {
      if (!node.selected) {
        updateNode(node.id, { selected: true });
      }
    });
  }, [reactFlowInstance, updateNode]);

  const handleSelectionEnd = useCallback(
    (event: ReactMouseEvent) => {
      onSelectionEnd(event);
      selectionEndRef.current = projectMouseEventToFlow(event);
      selectGroupsWithinSelection();
      setIsSelecting(false);
      resetSelectionTracking();
    },
    [
      onSelectionEnd,
      projectMouseEventToFlow,
      selectGroupsWithinSelection,
      resetSelectionTracking
    ]
  );

  const handleSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      setIsSelecting(true);
      const flowPoint = projectMouseEventToFlow(event);
      selectionStartRef.current = flowPoint;
      selectionEndRef.current = flowPoint;
      onSelectionStart(event);
    },
    [onSelectionStart, projectMouseEventToFlow]
  );

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

  // Keep edge selection in sync with node selection in a single place.
  // An edge is selected when either of its endpoint nodes is selected.
  useEffect(() => {
    // During selection drag we keep the previous edge selection state
    // and only recompute once the drag is finished. This avoids extra
    // work on every small selection change.
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

  const reactFlowClasses = [
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
        colorMode={isDarkMode ? "dark" : "light"}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "var(--c_editor_bg_color)"
        }}
        onlyRenderVisibleElements={false} // if true, adds lag when panning
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
        // isValidConnection={(connection) => {
        //   if (!connection.source || !connection.target) return true;
        //   const src = findNode(connection.source);
        //   const tgt = findNode(connection.target);
        //   if (!src || !tgt) return false;
        //   return validateConnection(connection as Connection, src, tgt);
        // }}
        attributionPosition="bottom-left"
        selectNodesOnDrag={settings.selectNodesOnDrag}
        // onClick={handleClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDrag={onNodeDrag}
        onSelectionDragStart={handleSelectionDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={handleSelectionDragStop}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        onSelectionContextMenu={handleSelectionContextMenu}
        selectionMode={settings.selectionMode as SelectionMode}
        onEdgesChange={onEdgesChange}
        // onEdgeMouseLeave={onEdgeMouseLeave}
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
      {pendingNodeType && ghostPosition && (
        <div
          style={{
            position: "fixed",
            top: ghostPosition.y,
            left: ghostPosition.x,
            transform: "translate(-50%, -60%)",
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            zIndex: 4000,
            color: ghostTheme.textColor,
            textShadow: "0 6px 20px rgba(15, 23, 42, 0.35)"
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "18px",
              border: `1.6px solid ${ghostTheme.badgeBorder}`,
              background: ghostTheme.badgeBackground,
              boxShadow: ghostTheme.badgeShadow,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              fontWeight: 500,
              backdropFilter: "blur(10px)",
              color: ghostTheme.accentColor
            }}
          >
            +
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: "12px",
              background: ghostTheme.labelBackground,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.25)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.02em"
            }}
          >
            {placementLabel ?? pendingNodeType.split(".").pop()}
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: ghostTheme.hintColor
            }}
          >
            Click to place · Esc to cancel
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ReactFlowWrapper, isEqual);
