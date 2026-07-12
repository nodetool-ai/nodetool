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
import { useLiveRunStore } from "../../stores/LiveRunStore";
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
import DynamicKieSchemaNode from "../node/DynamicKieSchemaNode/DynamicKieSchemaNode";
import { DYNAMIC_KIE_NODE_TYPE } from "../node/DynamicKieSchemaNode/KieSchemaLoader";
import DynamicComfySchemaNode from "../node/DynamicComfySchemaNode/DynamicComfySchemaNode";
import {
  DynamicReplicateNode,
  DYNAMIC_REPLICATE_NODE_TYPE
} from "../node/DynamicReplicateNode";
import {
  WorkflowNode,
  WORKFLOW_NODE_TYPE
} from "../node/WorkflowNode";
import { SubgraphNode, SUBGRAPH_NODE_TYPE } from "../node/SubgraphNode";
import {
  GROUP_NODE_TYPE,
  COMMENT_NODE_TYPE,
  PREVIEW_NODE_TYPE,
  REROUTE_NODE_TYPE,
  STRING_NODE_TYPE,
  DYNAMIC_COMFY_NODE_TYPE
} from "../../constants/nodeTypes";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import ConstantStringNode from "../node/ConstantStringNode";
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
import { useProcessedEdges } from "../../hooks/useProcessedEdges";
import { useFitNodeEvent } from "../../hooks/useFitNodeEvent";
import { MAX_ZOOM, MIN_ZOOM, ZOOMED_OUT } from "../../config/constants";
import GroupNode from "../node/GroupNode";
import isEqual from "../../utils/isEqual";
import { useTheme } from "@mui/material/styles";
import AxisMarker from "../node_editor/AxisMarker";
import ConnectionLine from "../node_editor/ConnectionLine";
import EdgeGradientDefinitions from "../node_editor/EdgeGradientDefinitions";
import ConnectableNodes from "../context_menus/ConnectableNodes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflow } from "../../serverState/useWorkflow";
import { Text, LoadingSpinner } from "../ui_primitives";
import { DATA_TYPES } from "../../config/data_types";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore from "../../stores/StatusStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import { useReactFlowEvents } from "../../hooks/handlers/useReactFlowEvents";
import { usePaneEvents } from "../../hooks/handlers/usePaneEvents";
import { useNodeEvents } from "../../hooks/handlers/useNodeEvents";
import { useSelectionEvents } from "../../hooks/handlers/useSelectionEvents";
import { useConnectionEvents } from "../../hooks/handlers/useConnectionEvents";
import type { NodeData } from "../../stores/NodeData";
import type { NodeStoreState } from "../../stores/NodeStore";
import { scheduleNodeInternalsRefresh } from "../../utils/scheduleNodeInternalsRefresh";
import type { EdgeKey, NodeKey } from "../../stores/nodeKey";

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

interface ReactFlowWrapperProps {
  workflowId: string;
}

import GhostNode from "./GhostNode";
import SketchNode, {
  SKETCH_NODE_TYPE
} from "../node/SketchNode/SketchNode";
import MiniMapNavigator from "./MiniMapNavigator";
import ViewportStatusIndicator from "../node_editor/ViewportStatusIndicator";
import CustomEdge from "../node_editor/CustomEdge";
import ControlEdge from "../node_editor/ControlEdge";

/** React Flow edge paths use both endpoints — refresh neighbors when one node’s DOM height changes. */
function withEdgeNeighborNodeIds(
  nodeIds: readonly string[],
  edgeList: Edge[]
): string[] {
  const result = new Set(nodeIds);
  for (const edge of edgeList) {
    const src = edge.source;
    const tgt = edge.target;
    if (!src || !tgt) {
      continue;
    }
    if (result.has(src)) {
      result.add(tgt);
    }
    if (result.has(tgt)) {
      result.add(src);
    }
  }
  return [...result];
}

const ReactFlowWrapper = ({
  workflowId
}: ReactFlowWrapperProps) => {
  const workflowManagerStore = useWorkflowManagerStore();
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

  const [isSelecting] = useState(false);
  const [suppressNodeDrivenEdgeSelection, setSuppressNodeDrivenEdgeSelection] =
    useState(false);

  const reactFlowInstance = useReactFlow();
  const { pendingNodeType, cancelPlacement, placementLabel } =
    useNodePlacementStore(
      useShallow((state) => ({
        pendingNodeType: state.pendingNodeType,
        cancelPlacement: state.cancelPlacement,
        placementLabel: state.label
      }))
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

  // Structural fingerprint: only changes when layout-relevant fields change
  // (height, collapsed, exposed inputs, dynamic props). Position-only drag
  // frames produce the same string, so the effect below stays dormant.
  const nodeLayoutFingerprint = useMemo(() => {
    const cache = sortedKeysCache.current;
    const getSortedKeys = (obj: object | null | undefined): string => {
      if (!obj) return "";
      const cached = cache.get(obj);
      if (cached !== undefined) return cached;
      const result = Object.keys(obj).sort().join(",");
      cache.set(obj, result);
      return result;
    };

    const parts: string[] = [];
    for (const n of nodes) {
      const sh = n.style?.height;
      const stylePart =
        typeof sh === "number"
          ? String(sh)
          : typeof sh === "string"
            ? sh.trim()
            : "";
      const exposedPart = [
        ...(n.data.exposedInputs ?? []),
        ...(n.data.exposedInputsLabeled ?? []),
        ...(n.data.exposedInputsHidden ?? [])
      ].join(",");
      parts.push(
        `${n.id}:${typeof n.height === "number" ? n.height : ""}:${stylePart}:${Boolean(n.data.collapsed)}:${exposedPart}:${getSortedKeys(n.data.dynamic_properties)}:${getSortedKeys(n.data.dynamic_inputs)}:${getSortedKeys(n.data.dynamic_outputs)}`
      );
    }
    return parts.join("|");
  }, [nodes]);

  useEffect(() => {
    const cache = sortedKeysCache.current;
    const getSortedKeys = (obj: object | null | undefined): string => {
      if (!obj) return "";
      const cached = cache.get(obj);
      if (cached !== undefined) return cached;
      const result = Object.keys(obj).sort().join(",");
      cache.set(obj, result);
      return result;
    };

    const currentNodes = nodesRef.current;
    const next = new Map<string, string>();
    for (const n of currentNodes) {
      const sh = n.style?.height;
      const stylePart =
        typeof sh === "number"
          ? String(sh)
          : typeof sh === "string"
            ? sh.trim()
            : "";
      const exposedPart = [
        ...(n.data.exposedInputs ?? []),
        ...(n.data.exposedInputsLabeled ?? []),
        ...(n.data.exposedInputsHidden ?? [])
      ].join(",");
      const dynPropsPart = getSortedKeys(n.data.dynamic_properties);
      const dynInputsPart = getSortedKeys(n.data.dynamic_inputs);
      const dynOutputsPart = getSortedKeys(n.data.dynamic_outputs);
      next.set(
        n.id,
        `${typeof n.height === "number" ? n.height : ""}:${stylePart}:${Boolean(n.data.collapsed)}:${exposedPart}:${dynPropsPart}:${dynInputsPart}:${dynOutputsPart}`
      );
    }
    const changedIds: string[] = [];
    for (const [id, sig] of next) {
      const prev = nodeLayoutSigRef.current.get(id);
      if (prev !== sig) {
        changedIds.push(id);
        nodeLayoutSigRef.current.set(id, sig);
      }
    }
    for (const id of [...nodeLayoutSigRef.current.keys()]) {
      if (!next.has(id)) {
        nodeLayoutSigRef.current.delete(id);
      }
    }

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
  const nodeTypes = useMemo(
    () => ({
      ...baseNodeTypes,
      [GROUP_NODE_TYPE]: GroupNode,
      [COMMENT_NODE_TYPE]: CommentNode,
      [PREVIEW_NODE_TYPE]: PreviewNode,
      "nodetool.workflows.base_node.Output": OutputNode,
      "nodetool.output.Output": OutputNode,
      "nodetool.compare.CompareImages": CompareImagesNode,
      [STRING_NODE_TYPE]: ConstantStringNode,
      [REROUTE_NODE_TYPE]: RerouteNode,
      [DYNAMIC_FAL_NODE_TYPE]: DynamicFalSchemaNode,
      [DYNAMIC_KIE_NODE_TYPE]: DynamicKieSchemaNode,
      "kie.DynamicKie": DynamicKieSchemaNode,
      [DYNAMIC_REPLICATE_NODE_TYPE]: DynamicReplicateNode,
      [DYNAMIC_COMFY_NODE_TYPE]: DynamicComfySchemaNode,
      [WORKFLOW_NODE_TYPE]: WorkflowNode,
      [SUBGRAPH_NODE_TYPE]: SubgraphNode,
      [SKETCH_NODE_TYPE]: SketchNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes]
  );

  const edgeTypes = EDGE_TYPES;

  const {
    gridSnap,
    connectionSnap,
    panControls,
    selectNodesOnDrag,
    selectionMode,
    instantUpdate
  } = useSettingsStore(
    useShallow((state) => ({
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

  useEffect(() => {
    if (!pendingNodeType) {
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
      setGhostPosition(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelPlacement();
      }
    };

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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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
      onEdgeClickBase(event, edge);
    },
    [onEdgeClickBase]
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

  const selectionEvents = useSelectionEvents({
    reactFlowInstance,
    onSelectionStartBase: onSelectionStart,
    onSelectionEndBase: onSelectionEnd,
    onSelectionDragStartBase: onSelectionDragStart,
    onSelectionDragStopBase: onSelectionDragStop,
    setSuppressNodeDrivenEdgeSelection
  });

  const handleNodeClick = useCallback((_event: ReactMouseEvent, _node: Node) => {
    setSuppressNodeDrivenEdgeSelection(false);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      if (node.type !== SUBGRAPH_NODE_TYPE) return;
      const data = node.data as {
        workflow_id?: string;
        title?: string;
        properties?: { graph?: { nodes?: unknown[]; edges?: unknown[] } };
      };
      const innerGraph = data.properties?.graph ?? { nodes: [], edges: [] };
      const key = useSubgraphTabsStore.getState().openTab({
        workflowId: data.workflow_id ?? "",
        nodeId: node.id,
        label: data.title || "Subgraph",
        initialGraph: {
          nodes: Array.isArray(innerGraph.nodes) ? innerGraph.nodes : [],
          edges: Array.isArray(innerGraph.edges) ? innerGraph.edges : []
        }
      });
      const tab = useSubgraphTabsStore.getState().getTab(key);
      if (tab) {
        // Register the subgraph store synchronously so the upcoming
        // SubgraphTabContent → ReactFlowWrapper render sees
        // workflowExistsLocally === true and skips the 404 fetch for
        // the synthetic id. SubgraphTabContent's useEffect also
        // re-registers (idempotent) to survive StrictMode double-mount.
        workflowManagerStore.setState((state) => ({
          nodeStores: { ...state.nodeStores, [key]: tab.store }
        }));
      }
    },
    [workflowManagerStore]
  );

  const handlePaneClickWithSuppress = useCallback(
    (event: ReactMouseEvent) => {
      setSuppressNodeDrivenEdgeSelection(false);
      handlePaneClick(event);
    },
    [handlePaneClick]
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
  const edgeStatusesSelector = useMemo(() => {
    let lastSource: ResultsState["edges"] | null = null;
    let lastResult: ResultsState["edges"] = {};
    let lastCount = 0;
    return (state: ResultsState) => {
      if (state.edges === lastSource) return lastResult;
      lastSource = state.edges;
      if (!runPrefix) {
        if (lastCount !== 0) {
          lastResult = {};
          lastCount = 0;
        }
        return lastResult;
      }
      const next: ResultsState["edges"] = {};
      let count = 0;
      let changed = false;
      for (const key in state.edges) {
        if (key.startsWith(runPrefix)) {
          next[key as EdgeKey] = state.edges[key as EdgeKey];
          count++;
          if (lastResult[key as EdgeKey] !== next[key as EdgeKey]) {
            changed = true;
          }
        }
      }
      if (!changed && count === lastCount) return lastResult;
      lastResult = next;
      lastCount = count;
      return next;
    };
  }, [runPrefix]);
  const edgeStatuses = useResultsStore(edgeStatusesSelector);

  const nodeStatusesSelector = useMemo(() => {
    let lastSource: StatusState["statuses"] | null = null;
    let lastResult: StatusState["statuses"] = {};
    let lastCount = 0;
    return (state: StatusState) => {
      if (state.statuses === lastSource) return lastResult;
      lastSource = state.statuses;
      if (!runPrefix) {
        if (lastCount !== 0) {
          lastResult = {};
          lastCount = 0;
        }
        return lastResult;
      }
      const next: StatusState["statuses"] = {};
      let count = 0;
      let changed = false;
      for (const key in state.statuses) {
        if (key.startsWith(runPrefix)) {
          next[key as NodeKey] = state.statuses[key as NodeKey];
          count++;
          if (lastResult[key as NodeKey] !== next[key as NodeKey]) {
            changed = true;
          }
        }
      }
      if (!changed && count === lastCount) return lastResult;
      lastResult = next;
      lastCount = count;
      return next;
    };
  }, [runPrefix]);
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
  const selectedNodeIds = useNodes(selectedNodeIdsSelector, (a, b) => {
    if (a.size !== b.size) return false;
    for (const id of a) if (!b.has(id)) return false;
    return true;
  });

  // Track previous selectedNodeIds to skip edge processing when selection hasn't changed
  const prevSelectedNodeIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (isSelecting) {
      return;
    }

    const currentEdges = edgesRef.current;
    if (!currentEdges.length) {
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

    for (const edge of currentEdges) {
      const isEdgeAlreadySelected = Boolean(edge.selected);
      const nodeDrivenSelection =
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
      const shouldSelect =
        isEdgeAlreadySelected ||
        (!suppressNodeDrivenEdgeSelection && nodeDrivenSelection);

      if (isEdgeAlreadySelected !== shouldSelect) {
        selectionUpdates[edge.id] = shouldSelect;
      }
    }

    if (Object.keys(selectionUpdates).length > 0) {
      setEdgeSelectionState(selectionUpdates);
    }
  }, [
    setEdgeSelectionState,
    isSelecting,
    selectedNodeIds,
    suppressNodeDrivenEdgeSelection
  ]);

  useEffect(() => {
    if (shouldFitToScreen) {
      setShouldFitToScreen(false);
    }
  }, [shouldFitToScreen, setShouldFitToScreen]);

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
    return classes.join(" ");
  }, [zoomedOut, connecting, instantUpdate, isScrubbing]);

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
        nodes={nodes}
        edges={processedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid={true}
        snapGrid={snapGrid}
        defaultViewport={storedViewport || undefined}
        onMoveEnd={handleMoveEnd}
        panOnDrag={panOnDrag}
        panOnScroll={IS_APPLE_PLATFORM}
        zoomOnPinch={IS_APPLE_PLATFORM}
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
