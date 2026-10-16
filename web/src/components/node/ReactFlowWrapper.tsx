/** @jsxImportSource @emotion/react */
import {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  memo,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import {
  useReactFlow,
  Background,
  BackgroundVariant,
  ReactFlow,
  SelectionMode,
  ConnectionMode,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeChange
} from "@xyflow/react";

import useConnectionStore from "../../stores/ConnectionStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useShallow } from "zustand/react/shallow";
import { useQuery } from "@tanstack/react-query";
import { useLiveRunStore } from "../../stores/LiveRunStore";
import ContextMenus from "../context_menus/ContextMenus";
import CodeGenDialogHost from "../code_gen/CodeGenDialogHost";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode/PreviewNode";
import { OutputNode } from "../node/OutputNode";
import { CompareImagesNode } from "../node/CompareImagesNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import RerouteNode from "../node/RerouteNode";
import DynamicFalSchemaNode from "../node/DynamicFalSchemaNode/DynamicFalSchemaNode";
import { DYNAMIC_FAL_NODE_TYPE } from "../node/DynamicFalSchemaNode/FalSchemaLoader";
import DynamicKieSchemaNode from "../node/DynamicKieSchemaNode/DynamicKieSchemaNode";
import { DYNAMIC_KIE_NODE_TYPE } from "../node/DynamicKieSchemaNode/KieSchemaLoader";
import DynamicComfySchemaNode from "../node/DynamicComfySchemaNode/DynamicComfySchemaNode";
import DynamicReplicateNode from "../node/DynamicReplicateNode/DynamicReplicateNode";
import { DYNAMIC_REPLICATE_NODE_TYPE } from "../node/DynamicReplicateNode/ReplicateSchemaLoader";
import {
  WorkflowNode,
  WORKFLOW_NODE_TYPE
} from "../node/WorkflowNode";
import SubgraphNode from "../node/SubgraphNode/SubgraphNode";
import AppNode from "../node/AppNode/AppNode";
import {
  GROUP_NODE_TYPE,
  COMMENT_NODE_TYPE,
  PREVIEW_NODE_TYPE,
  REROUTE_NODE_TYPE,
  STRING_NODE_TYPE,
  SUBGRAPH_NODE_TYPE,
  APP_NODE_TYPE,
  DYNAMIC_COMFY_NODE_TYPES
} from "../../constants/nodeTypes";
import {
  useOpenSubgraph,
  type SubgraphNodeData
} from "../../hooks/nodes/useOpenSubgraph";
import ConstantStringNode from "../node/ConstantStringNode";
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
import { useProcessedEdges } from "../../hooks/useProcessedEdges";
import {
  EMPTY_UNTAKEN_BRANCH,
  findUntakenBranch,
  sameUntakenBranch,
  type UntakenBranch
} from "../../utils/untakenBranches";
import { useFitNodeEvent } from "../../hooks/useFitNodeEvent";
import { useFitToScreenRequest } from "../../hooks/useFitToScreenRequest";
import { useClearInspectorOverlap } from "../../hooks/useClearInspectorOverlap";
import { useInitialFitAboveChatDock } from "../../hooks/useInitialFitAboveChatDock";
import { useNodeDragDiagnostics } from "../../hooks/useNodeDragDiagnostics";
import { MAX_ZOOM, MIN_ZOOM, ZOOMED_OUT } from "../../config/constants";
import GroupNode from "../node/GroupNode";
import isEqual from "../../utils/isEqual";
import { useTheme } from "@mui/material/styles";
import AxisMarker from "../node_editor/AxisMarker";
import ConnectionLine from "../node_editor/ConnectionLine";
import EdgeGradientDefinitions from "../node_editor/EdgeGradientDefinitions";
import ConnectableNodes from "../context_menus/ConnectableNodes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodeStoreRef, useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflow } from "../../serverState/useWorkflow";
import { workflowListQueryKey } from "../../serverState/workflowQueryKeys";
import { trpcClient } from "../../trpc/client";
import { Text, LoadingSpinner } from "../ui_primitives";
import { DATA_TYPES } from "../../config/data_types";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore from "../../stores/StatusStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useReactFlowEvents } from "../../hooks/handlers/useReactFlowEvents";
import { usePaneEvents } from "../../hooks/handlers/usePaneEvents";
import { useNodeEvents } from "../../hooks/handlers/useNodeEvents";
import { useSelectionEvents } from "../../hooks/handlers/useSelectionEvents";
import { useConnectionEvents } from "../../hooks/handlers/useConnectionEvents";
import type { NodeData } from "../../stores/NodeData";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  scheduleNodeInternalsRefresh,
  withEdgeNeighborNodeIds
} from "../../utils/scheduleNodeInternalsRefresh";
import { edgeKey } from "../../stores/nodeKey";
import FirstWorkflowGuide from "../node_editor/FirstWorkflowGuide";
import { Slugify } from "../../utils/TypeHandler";
import { PortLabelVisibilityContext } from "../../contexts/PortLabelVisibilityContext";

type ResultsState = ReturnType<typeof useResultsStore.getState>;
type StatusState = ReturnType<typeof useStatusStore.getState>;

const CONTAINER_STYLE = {
  width: "100%",
  height: "100%",
  position: "absolute" as const,
  backgroundColor: "var(--c_editor_bg_color)",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0
};

const REACT_FLOW_STYLE = {
  width: "100%",
  height: "100%",
  backgroundColor: "var(--c_editor_bg_color)"
};

const EDGE_TYPES = {
  default: CustomEdge,
  control: ControlEdge
};

const IS_APPLE_PLATFORM = /Mac|iPhone|iPad/.test(navigator.platform);

/** Local, worker, and Cloud ComfyUI runners all render the same node body. */
const comfyNodeTypes = Object.fromEntries(
  [...DYNAMIC_COMFY_NODE_TYPES].map((type) => [type, DynamicComfySchemaNode])
);

interface ReactFlowWrapperProps {
  workflowId: string;
  /** False for a tab that is mounted but not shown. Defaults to true. */
  active?: boolean;
}

import GhostNode from "./GhostNode";
import SketchNode, {
  SKETCH_NODE_TYPE
} from "../node/SketchNode/SketchNode";
import MiniMapNavigator from "./MiniMapNavigator";
import ViewportStatusIndicator from "../node_editor/ViewportStatusIndicator";
import CustomEdge from "../node_editor/CustomEdge";
import ControlEdge from "../node_editor/ControlEdge";
import LinkLayer from "../node_editor/LinkLayer";
import { usePlaceholderNodeTypes } from "../node_types/usePlaceholderNodeTypes";
import {
  branchNodeIds,
  changedLayoutIds,
  createRunScopedSelector,
  firstWorkflowReadiness as firstWorkflowReadinessOf,
  markComprehensionEdges,
  nodeComprehensionClasses,
  nodeDrivenEdgeSelection,
  nodeLayoutSignature,
  sameIdSet,
  type ComprehensionContext
} from "./reactFlowGraphModel";

const ReactFlowWrapper = ({
  workflowId,
  active = true
}: ReactFlowWrapperProps) => {
  const openSubgraph = useOpenSubgraph();
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
    workflowIsDirty,
    deleteEdge,
    setEdgeSelectionState,
    createNode,
    addNode,
    addEdge,
    generateEdgeId,
    setLinkSelection
  } = useNodes(
    useMemo(
      () => (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        onEdgesChange: state.onEdgesChange,
        onEdgeUpdate: state.onEdgeUpdate,
        shouldFitToScreen: state.shouldFitToScreen,
        setShouldFitToScreen: state.setShouldFitToScreen,
        workflowIsDirty: state.workflowIsDirty,
        deleteEdge: state.deleteEdge,
        setEdgeSelectionState: state.setEdgeSelectionState,
        createNode: state.createNode,
        addNode: state.addNode,
        addEdge: state.addEdge,
        generateEdgeId: state.generateEdgeId,
        setLinkSelection: state.setLinkSelection
      }),
      []
    )
  );
  // React Flow reads `defaultViewport` only on mount, and the stored viewport
  // is rewritten after every pan or zoom, so read it once instead of
  // re-rendering the whole editor each time a gesture ends.
  const nodeStore = useNodeStoreRef();
  const [storedViewport] = useState(() => nodeStore.getState().viewport);

  const [isSelecting] = useState(false);
  const [showFirstWorkflowGuide, setShowFirstWorkflowGuide] = useState(false);
  const { data: savedWorkflows } = useQuery({
    queryKey: workflowListQueryKey(1),
    queryFn: () => trpcClient.workflows.list.query({ limit: 1 }),
    enabled: nodes.length === 0 || showFirstWorkflowGuide,
    staleTime: 60_000
  });
  const [showPortLabels, setShowPortLabels] = useState(false);
  // Stable so the memoized ViewportStatusIndicator skips this component's
  // per-frame re-renders during drags.
  const togglePortLabels = useCallback(
    () => setShowPortLabels((visible) => !visible),
    []
  );
  const [suppressNodeDrivenEdgeSelection, setSuppressNodeDrivenEdgeSelection] =
    useState(false);

  const reactFlowInstance = useReactFlow();
  const starterInputMetadata = useMetadataStore(
    (state) => state.metadata["nodetool.input.StringInput"]
  );
  const starterOutputMetadata = useMetadataStore(
    (state) => state.metadata["nodetool.output.Output"]
  );
  const workflowRuns = useWorkflowRunsStore(
    (state) => state.runs[workflowId]
  );
  const { pendingNodeType, cancelPlacement, placementLabel } =
    useNodePlacementStore(
      useShallow((state) => ({
        pendingNodeType: state.pendingNodeType,
        cancelPlacement: state.cancelPlacement,
        placementLabel: state.label
      }))
    );

  useEffect(() => {
    setShowFirstWorkflowGuide(false);
  }, [workflowId]);

  const handleStartFirstWorkflow = useCallback(() => {
    setShowFirstWorkflowGuide(true);
    if (!starterInputMetadata || !starterOutputMetadata) {
      useNodeMenuStore.getState().openNodeMenu({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        searchTerm: "String Input",
        centerOnScreen: true
      });
      return;
    }
    const inputNode = createNode(starterInputMetadata, { x: -240, y: 0 });
    const outputNode = createNode(starterOutputMetadata, { x: 240, y: 0 });
    addNode(inputNode);
    addNode(outputNode);
    addEdge({
      id: generateEdgeId(),
      source: inputNode.id,
      target: outputNode.id,
      sourceHandle: "output",
      targetHandle: "value",
      type: "default",
      className: Slugify("str")
    });
    setShouldFitToScreen(true);
  }, [
    addEdge,
    addNode,
    createNode,
    generateEdgeId,
    setShouldFitToScreen,
    starterInputMetadata,
    starterOutputMetadata
  ]);

  const handleChooseOwnNodes = useCallback(() => {
    setShowFirstWorkflowGuide(true);
    useNodeMenuStore.getState().openNodeMenu({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      centerOnScreen: true
    });
  }, []);

  const firstWorkflowReadiness = useMemo(
    () =>
      firstWorkflowReadinessOf(
        nodes,
        edges,
        workflowIsDirty,
        Object.values(workflowRuns ?? {})
      ),
    [edges, nodes, workflowIsDirty, workflowRuns]
  );
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
      hintColor: isDark ? "rgba(148, 163, 184, 0.9)" : "rgba(71, 85, 105, 0.9)",
      // Fixed drag preview: above canvas/panels, below the node menu.
      zIndex: theme.zIndex.floating
    };
  }, [theme.palette.mode, theme.vars.palette.primary.main, theme.zIndex.floating]);

  const backgroundStyle = useMemo(
    () => ({
      backgroundColor: theme.vars.palette.c_editor_bg_color
    }),
    [theme.vars.palette.c_editor_bg_color]
  );

  useFitNodeEvent();
  useNodeDragDiagnostics(import.meta.env.DEV);

  const { handleMoveEnd, handleOnMoveStart } = useReactFlowEvents();

  // Subscribe directly to `nodeStores[workflowId]` so the component re-renders
  // when an ephemeral store is registered (e.g. a subgraph tab opening).
  // Selecting `state.getNodeStore` would return a stable function reference
  // and miss the store-injection event.
  const workflowExistsLocally = useWorkflowManager((state) =>
    workflowId ? !!state.nodeStores[workflowId] : false
  );

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
  // Use refs to avoid re-running on every node position change (60fps drag).
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const prevConnectingRef = useRef(connecting);
  const prevEdgeCountRef = useRef(edges.length);
  useEffect(() => {
    const dragEnded = prevConnectingRef.current && !connecting;
    const edgesChanged = prevEdgeCountRef.current !== edges.length;
    prevConnectingRef.current = connecting;
    prevEdgeCountRef.current = edges.length;
    if (dragEnded || edgesChanged) {
      const rafId = requestAnimationFrame(() => {
        const nodeIds = nodesRef.current.map((n) => n.id);
        if (nodeIds.length > 0) {
          updateNodeInternals(nodeIds);
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [connecting, edges.length, updateNodeInternals]);

  /** Tracks layout-driving fields so programmatic collapse/expand (no active resize drag) retriggers RF handle math */
  const nodeLayoutSigRef = useRef<Map<string, string>>(new Map());
  const nodeLayoutFingerprintSkipFirstRef = useRef(true);
  useEffect(() => {
    nodeLayoutFingerprintSkipFirstRef.current = true;
    nodeLayoutSigRef.current.clear();
  }, [workflowId]);

  const sortedKeysCache = useRef(new WeakMap<object, string>());
  const perNodeSigCache = useRef(new WeakMap<NodeData, string>());
  const prevFingerprintRef = useRef("");
  // Node count behind `prevFingerprintRef`, so the check below never has to
  // split that string back apart on a 60fps drag.
  const prevFingerprintCountRef = useRef(1);

  // Structural fingerprint: only changes when layout-relevant fields change
  // (height, collapsed, exposed inputs, dynamic props). Position-only drag
  // frames produce the same string, so the effect below stays dormant.
  // Uses a per-node WeakMap cache keyed on `data` identity to avoid
  // recomputing string fragments during position-only drags (60fps).
  const nodeLayoutFingerprint = useMemo(() => {
    const keysCache = sortedKeysCache.current;
    const sigCache = perNodeSigCache.current;

    let changed = nodes.length !== prevFingerprintCountRef.current;
    const parts: string[] = [];
    for (const n of nodes) {
      let sig = sigCache.get(n.data);
      if (sig === undefined) {
        changed = true;
        sig = `${n.id}:${nodeLayoutSignature(n, keysCache)}`;
        sigCache.set(n.data, sig);
      }
      parts.push(sig);
    }
    if (!changed) return prevFingerprintRef.current;
    const result = parts.join("|");
    prevFingerprintRef.current = result;
    prevFingerprintCountRef.current = parts.length;
    return result;
  }, [nodes]);

  useEffect(() => {
    const changedIds = changedLayoutIds(
      nodesRef.current,
      nodeLayoutSigRef.current,
      sortedKeysCache.current
    );

    if (nodeLayoutFingerprintSkipFirstRef.current) {
      nodeLayoutFingerprintSkipFirstRef.current = false;
      return;
    }
    if (changedIds.length === 0) {
      return;
    }
    scheduleNodeInternalsRefresh(
      updateNodeInternals,
      withEdgeNeighborNodeIds(changedIds, edgesRef.current)
    );
  }, [nodeLayoutFingerprint, updateNodeInternals]);

  const ref = useRef<HTMLDivElement | null>(null);
  const zoomedOut = useStore((s) => s.transform[2] <= ZOOMED_OUT);

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
  const placeholderNodeTypes = usePlaceholderNodeTypes();
  const nodeTypes = useMemo(
    () => ({
      ...baseNodeTypes,
      ...placeholderNodeTypes,
      [GROUP_NODE_TYPE]: GroupNode,
      [COMMENT_NODE_TYPE]: CommentNode,
      [PREVIEW_NODE_TYPE]: PreviewNode,
      "nodetool.output.Output": OutputNode,
      "nodetool.compare.CompareImages": CompareImagesNode,
      [STRING_NODE_TYPE]: ConstantStringNode,
      [REROUTE_NODE_TYPE]: RerouteNode,
      [DYNAMIC_FAL_NODE_TYPE]: DynamicFalSchemaNode,
      [DYNAMIC_KIE_NODE_TYPE]: DynamicKieSchemaNode,
      "kie.DynamicKie": DynamicKieSchemaNode,
      [DYNAMIC_REPLICATE_NODE_TYPE]: DynamicReplicateNode,
      ...comfyNodeTypes,
      [WORKFLOW_NODE_TYPE]: WorkflowNode,
      [SUBGRAPH_NODE_TYPE]: SubgraphNode,
      [APP_NODE_TYPE]: AppNode,
      [SKETCH_NODE_TYPE]: SketchNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes, placeholderNodeTypes]
  );

  const edgeTypes = EDGE_TYPES;

  const {
    snapToGrid,
    gridSnap,
    connectionSnap,
    panControls,
    selectNodesOnDrag,
    selectionMode,
    instantUpdate
  } = useSettingsStore(
    useShallow((state) => ({
      snapToGrid: state.settings.snapToGrid,
      gridSnap: state.settings.gridSnap,
      connectionSnap: state.settings.connectionSnap,
      panControls: state.settings.panControls,
      selectNodesOnDrag: state.settings.selectNodesOnDrag,
      selectionMode: state.settings.selectionMode,
      instantUpdate: state.settings.instantUpdate
    }))
  );
  // Live slider scrubs re-run the graph continuously; freeze the same per-run
  // animations as instant-update mode while a scrub is active (independent of
  // the instantUpdate setting). See `useLiveSliderWriter` / `LiveRunStore`.
  const isScrubbing = useLiveRunStore((state) => state.isScrubbing);

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

  // Escape cancels an in-flight node placement.
  useGlobalCombo("escape", cancelPlacement, {
    active: Boolean(pendingNodeType),
    preventDefault: false
  });

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

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
      document.body.style.cursor = previousCursor;
    };
  }, [pendingNodeType, cancelPlacement]);

  const { isConnectionValid } = useConnectionEvents();

  const { handleDoubleClick, handlePaneClick, handlePaneContextMenu } =
    usePaneEvents({
      pendingNodeType,
      placementLabel,
      reactFlowInstance
    });

  const { handleNodeContextMenu, handleNodesChange: propagateNodesChange } =
    useNodeEvents();

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<NodeData>>[]) => {
      propagateNodesChange(changes);

      const dimIds = new Set<string>();
      for (const c of changes) {
        if (c.type !== "dimensions") {
          continue;
        }
        /* Mid-resize we already get continuous RF updates — skip storms */
        if ("resizing" in c && (c as { resizing?: boolean }).resizing === true) {
          continue;
        }
        dimIds.add(c.id);
      }
      if (dimIds.size === 0) {
        return;
      }
      scheduleNodeInternalsRefresh(
        updateNodeInternals,
        withEdgeNeighborNodeIds([...dimIds], edgesRef.current)
      );
    },
    [propagateNodesChange, updateNodeInternals]
  );

  const {
    onEdgeContextMenu,
    onEdgeUpdateEnd,
    onEdgeUpdateStart,
    onEdgeClick: onEdgeClickBase
  } = useEdgeHandlers();

  const onEdgeClick = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      setSuppressNodeDrivenEdgeSelection(false);
      // A link stays selected only with a modifier, or Delete would remove
      // it along with this edge.
      if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
        setLinkSelection([]);
      }
      onEdgeClickBase(event, edge);
    },
    [onEdgeClickBase, setLinkSelection]
  );

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

  // A box selection starts a new selection, links included.
  const onSelectionStartClearingLinks = useCallback(
    (event: ReactMouseEvent) => {
      setLinkSelection([]);
      onSelectionStart(event);
    },
    [onSelectionStart, setLinkSelection]
  );

  const selectionEvents = useSelectionEvents({
    reactFlowInstance,
    onSelectionStartBase: onSelectionStartClearingLinks,
    onSelectionEndBase: onSelectionEnd,
    onSelectionDragStartBase: onSelectionDragStart,
    onSelectionDragStopBase: onSelectionDragStop,
    setSuppressNodeDrivenEdgeSelection
  });

  const handleNodeClick = useCallback(
    (event: ReactMouseEvent, _node: Node) => {
      setSuppressNodeDrivenEdgeSelection(false);
      if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
        setLinkSelection([]);
      }
    },
    [setLinkSelection]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      if (node.type !== SUBGRAPH_NODE_TYPE) return;
      // The canvas this node is on, not `data.workflow_id`: that is only
      // stamped on nodes the store created, so a node loaded from a saved
      // graph would key its tab off "" and the strip would never find it.
      openSubgraph(workflowId, node.id, node.data as SubgraphNodeData);
    },
    [openSubgraph, workflowId]
  );

  const handlePaneClickWithSuppress = useCallback(
    (event: ReactMouseEvent) => {
      setSuppressNodeDrivenEdgeSelection(false);
      setLinkSelection([]);
      handlePaneClick(event);
    },
    [handlePaneClick, setLinkSelection]
  );

  // Node statuses are keyed per run; the canvas animates edges for the
  // workflow's focused run. Subscribing here re-runs edge processing when the
  // focus switches between concurrent runs.
  const focusedJobId = useWorkflowRunsStore(
    (state) => state.focusedJob[workflowId]
  );
  const runPrefix =
    workflowId && focusedJobId ? `${workflowId}:${focusedJobId}:` : null;

  // Both `edges` and `statuses` are global maps (keys `workflowId:jobId:id`)
  // rebuilt wholesale on every status write from ANY workflow or job. Scope
  // each subscription to the focused run's key prefix via a cached selector
  // that returns the SAME record reference unless an entry under that prefix
  // changed, so status writes from other workflows/jobs are no-ops here.
  const edgeStatusesSelector = useMemo(
    () =>
      createRunScopedSelector(
        runPrefix,
        (state: ResultsState) => state.edges
      ) as (state: ResultsState) => ResultsState["edges"],
    [runPrefix]
  );
  const edgeStatuses = useResultsStore(edgeStatusesSelector);

  const nodeStatusesSelector = useMemo(
    () =>
      createRunScopedSelector(
        runPrefix,
        (state: StatusState) => state.statuses
      ) as (state: StatusState) => StatusState["statuses"],
    [runPrefix]
  );
  const nodeStatuses = useStatusStore(nodeStatusesSelector);

  const { processedEdges, activeGradientKeys } = useProcessedEdges({
    edges,
    nodes,
    dataTypes: DATA_TYPES,
    getMetadata,
    workflowId,
    focusedJobId,
    edgeStatuses,
    nodeStatuses,
    isSelecting
  });
  const prevGradientKeysRef = useRef<Set<string>>(new Set());
  const prevGradientKeysArrayRef = useRef<string[]>([]);
  const activeGradientKeysArray = useMemo(() => {
    const prev = prevGradientKeysRef.current;
    if (
      activeGradientKeys.size === prev.size &&
      [...activeGradientKeys].every((k) => prev.has(k))
    ) {
      return prevGradientKeysArrayRef.current;
    }
    prevGradientKeysRef.current = activeGradientKeys;
    const arr = Array.from(activeGradientKeys);
    prevGradientKeysArrayRef.current = arr;
    return arr;
  }, [activeGradientKeys]);

  // Stable selector: only updates when the set of selected IDs actually changes,
  // not on every position update during drag. The selector itself runs on every
  // NodeStore update (drag frames, panning, edge ops); cache by `nodes` identity
  // so store updates that don't touch the nodes array (viewport, edge changes)
  // reuse the previous Set instead of re-scanning all nodes.
  const selectedNodeIdsSelector = useMemo(() => {
    let lastNodes: NodeStoreState["nodes"] | null = null;
    let lastResult = new Set<string>();
    return (state: NodeStoreState) => {
      if (state.nodes === lastNodes) {
        return lastResult;
      }
      lastNodes = state.nodes;
      const set = new Set<string>();
      for (const node of state.nodes) {
        if (node.selected) {
          set.add(node.id);
        }
      }
      lastResult = set;
      return set;
    };
  }, []);
  const selectedNodeIds = useNodes(selectedNodeIdsSelector, sameIdSet);

  const branchIds = useMemo(
    () => branchNodeIds(selectedNodeIds, edges),
    [edges, selectedNodeIds]
  );

  // After a run reports which If/Switch output fired, dim the nodes and edges
  // on the untaken branch. Node types come from the ref so position-only
  // drags don't recompute; the set keeps its identity while unchanged.
  const untakenBranchRef = useRef<UntakenBranch>(EMPTY_UNTAKEN_BRANCH);
  const untakenBranch = useMemo(() => {
    let next = EMPTY_UNTAKEN_BRANCH;
    if (workflowId && focusedJobId) {
      const nodeTypes = new Map(
        nodesRef.current.map((node) => [node.id, node.type])
      );
      next = findUntakenBranch(nodeTypes, edges, (edgeId) =>
        edgeStatuses[edgeKey(workflowId, focusedJobId, edgeId)]
      );
    }
    if (sameUntakenBranch(next, untakenBranchRef.current)) {
      return untakenBranchRef.current;
    }
    untakenBranchRef.current = next;
    return next;
  }, [edges, edgeStatuses, workflowId, focusedJobId]);

  const comprehensionNodeCacheRef = useRef(
    new Map<
      string,
      {
        source: Node<NodeData>;
        classes: string;
        result: Node<NodeData>;
      }
    >()
  );

  const comprehensionContext = useMemo<ComprehensionContext>(
    () => ({
      selectionActive: selectedNodeIds.size > 0,
      branch: branchIds,
      notRun: untakenBranch.nodeIds
    }),
    [branchIds, selectedNodeIds.size, untakenBranch]
  );

  const comprehensionNodes = useMemo(() => {
    if (selectedNodeIds.size === 0 && untakenBranch.nodeIds.size === 0) {
      return nodes;
    }
    const previous = comprehensionNodeCacheRef.current;
    const next = new Map<
      string,
      {
        source: Node<NodeData>;
        classes: string;
        result: Node<NodeData>;
      }
    >();
    const context = comprehensionContext;
    const mapped = nodes.map((node) => {
      const classes = nodeComprehensionClasses(node.id, context);
      if (!classes) {
        return node;
      }
      const cached = previous.get(node.id);
      if (cached?.source === node && cached.classes === classes) {
        next.set(node.id, cached);
        return cached.result;
      }
      const result = {
        ...node,
        className: [node.className, classes].filter(Boolean).join(" ")
      };
      next.set(node.id, { source: node, classes, result });
      return result;
    });
    comprehensionNodeCacheRef.current = next;
    return mapped;
  }, [comprehensionContext, nodes, selectedNodeIds.size, untakenBranch]);

  const comprehensionEdges = useMemo(
    () =>
      markComprehensionEdges(processedEdges, {
        selectionActive: selectedNodeIds.size > 0,
        branch: branchIds,
        notRun: untakenBranch.edgeIds
      }),
    [branchIds, processedEdges, selectedNodeIds.size, untakenBranch]
  );

  // Track previous selectedNodeIds to skip edge processing when selection hasn't changed
  const prevSelectedNodeIdsRef = useRef<Set<string> | null>(null);
  // Edges selected because an endpoint node was selected, so they can be
  // deselected again with that node. Edges the user clicked are not in here.
  const nodeDrivenEdgeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isSelecting) {
      return;
    }

    const currentEdges = edgesRef.current;
    if (!currentEdges.length) {
      return;
    }

    // Skip if the selected node ids have not changed.
    const prevIds = prevSelectedNodeIdsRef.current;
    if (prevIds !== null && sameIdSet(prevIds, selectedNodeIds)) {
      return;
    }
    prevSelectedNodeIdsRef.current = new Set(selectedNodeIds);

    const { updates, nodeDriven } = nodeDrivenEdgeSelection(
      currentEdges,
      selectedNodeIds,
      nodeDrivenEdgeIdsRef.current,
      suppressNodeDrivenEdgeSelection
    );
    nodeDrivenEdgeIdsRef.current = nodeDriven;

    if (Object.keys(updates).length > 0) {
      setEdgeSelectionState(updates);
    }
  }, [
    setEdgeSelectionState,
    isSelecting,
    selectedNodeIds,
    suppressNodeDrivenEdgeSelection
  ]);

  const fitToScreen = useCallback(() => {
    void reactFlowInstance.fitView({ duration: 400, padding: 0.1 });
  }, [reactFlowInstance]);
  useFitToScreenRequest(shouldFitToScreen, nodeStore, fitToScreen);
  useClearInspectorOverlap(active);
  useInitialFitAboveChatDock(active, storedViewport, nodes.length);

  const snapGrid = useMemo(
    () => [gridSnap, gridSnap] as [number, number],
    [gridSnap]
  );

  const reactFlowClasses = useMemo(() => {
    const classes = [];
    if (zoomedOut) {
      classes.push("zoomed-out");
    }
    if (connecting) {
      classes.push("is-connecting");
    }
    if (instantUpdate) {
      classes.push("instant-update");
    }
    if (isScrubbing) {
      classes.push("live-scrubbing");
    }
    if (showPortLabels) {
      classes.push("show-port-labels");
    }
    return classes.join(" ");
  }, [zoomedOut, connecting, instantUpdate, isScrubbing, showPortLabels]);

  const conditionalProps = useMemo(() => {
    const props: { selectionOnDrag?: boolean } = {};
    // fitView disabled — viewport is restored from stored state
    if (panControls === "RMB") {
      props.selectionOnDrag = true;
    }
    return props;
  }, [panControls]);

  // Local stores (subgraph tabs included) bypass the fetch entirely; ignore
  // any stale loading/error state cached from a previous query for the same
  // workflowId — those reflect the server fetch which is no longer relevant.
  if (!workflowExistsLocally && isLoading) {
    return (
      <div className="loading-overlay">
        <LoadingSpinner /> Loading workflow…
      </div>
    );
  }
  if (!workflowExistsLocally && error) {
    return (
      <div className="loading-overlay">
        <Text color="error">
          {error.message}
        </Text>
      </div>
    );
  }

  return (
    <PortLabelVisibilityContext.Provider value={showPortLabels}>
      <div style={CONTAINER_STYLE}>
        <ReactFlow
        className={reactFlowClasses}
        colorMode={isDarkMode ? "dark" : "light"}
        style={REACT_FLOW_STYLE}
        onlyRenderVisibleElements={false}
        ref={ref}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        autoPanOnNodeDrag={true}
        autoPanOnConnect={true}
        autoPanSpeed={50}
        {...conditionalProps}
        nodes={comprehensionNodes}
        edges={comprehensionEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid={snapToGrid}
        snapGrid={snapGrid}
        defaultViewport={storedViewport || undefined}
        onMoveEnd={handleMoveEnd}
        panOnDrag={panOnDrag}
        panOnScroll={IS_APPLE_PLATFORM}
        zoomOnPinch
        zoomOnScroll={!IS_APPLE_PLATFORM}
        elevateEdgesOnSelect={true}
        connectionLineComponent={ConnectionLine}
        connectionRadius={connectionSnap}
        isValidConnection={isConnectionValid}
        attributionPosition="bottom-left"
        selectNodesOnDrag={selectNodesOnDrag}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDrag={onNodeDrag}
        onSelectionDragStart={selectionEvents.handleSelectionDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={selectionEvents.handleSelectionDragStop}
        onSelectionStart={selectionEvents.handleSelectionStart}
        onSelectionEnd={selectionEvents.handleSelectionEnd}
        onSelectionContextMenu={selectionEvents.handleSelectionContextMenu}
        selectionMode={selectionMode as SelectionMode}
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
        onPaneClick={handlePaneClickWithSuppress}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={handleOnMoveStart}
        onDoubleClick={handleDoubleClick}
        proOptions={proOptions}
        panActivationKeyCode=""
        deleteKeyCode={null}
        // Arrow-key nudge and Shift+Arrow align are editor shortcuts. React
        // Flow's own keyboard handling on a focused node or selection box
        // would move the selection a second time.
        disableKeyboardA11y
      >
        <Background
          id={workflowId}
          gap={25}
          offset={1}
          size={3}
          color={theme.vars.palette.c_editor_grid_color}
          lineWidth={1}
          style={backgroundStyle}
          variant={BackgroundVariant.Cross}
        />
        <AxisMarker />
        <LinkLayer />
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
      <ViewportStatusIndicator
        showPortLabels={showPortLabels}
        onTogglePortLabels={togglePortLabels}
      />
      {(nodes.length === 0 || showFirstWorkflowGuide) && (
        <FirstWorkflowGuide
          hasSavedWorkflows={
            savedWorkflows ? savedWorkflows.workflows.length > 0 : undefined
          }
          started={showFirstWorkflowGuide}
          readiness={firstWorkflowReadiness}
          onStart={handleStartFirstWorkflow}
          onChooseOwn={handleChooseOwnNodes}
          onClose={() => setShowFirstWorkflowGuide(false)}
        />
      )}
        <CodeGenDialogHost />
      </div>
    </PortLabelVisibilityContext.Provider>
  );
};

export default memo(ReactFlowWrapper, isEqual);
