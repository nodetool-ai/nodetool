/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { colorForType } from "../../config/data_types";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Edge,
  Handle,
  Node,
  NodeProps,
  NodeResizer,
  NodeToolbar,
  Position,
  ResizeParams
} from "@xyflow/react";
import isEqual from "fast-deep-equal";
import { Container, BORDER_RADIUS, MOTION } from "../ui_primitives";
import FalPricingFooter from "./FalPricingFooter";
import KieCreditsFooter from "./KieCreditsFooter";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "./NodeHeader";
import { NodeErrors } from "./NodeErrors";
import NodeDependencyWarning from "./NodeDependencyWarning";
import {
  useNodeStatus,
  useNodeHasError,
  useNodeArtifacts,
  useNodeActiveRunCount
} from "../../hooks/nodes/useNodeExecState";
import ApiKeyValidation from "./ApiKeyValidation";
import InputNodeNameWarning from "./InputNodeNameWarning";
import RequiredSettingsWarning from "./RequiredSettingsWarning";
import NodeStatus from "./NodeStatus";
import NodeContent from "./NodeContent";
import { NodeSelectionContext } from "./NodeSelectionContext";
import { getBaseNodeSelectionStyles } from "./selectionStyles";
import NodeToolButtons from "./NodeToolButtons";
import NodeExecutionTime from "./NodeExecutionTime";
import { hexToRgba } from "../../utils/ColorUtils";
import { resolveExposedInputNames } from "../../utils/exposedInputs";
import useMetadataStore from "../../stores/MetadataStore";
import useSelect from "../../hooks/nodes/useSelect";
import EditableTitle from "./EditableTitle";
import { NodeMetadata, Property, OutputSlot } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
import PlanningUpdateDisplay from "./PlanningUpdateDisplay";
import ChunkDisplay from "./ChunkDisplay";
import NodeTerminal from "./NodeTerminal";
import NodeResizeHandle from "./NodeResizeHandle";
import { useDelayedVisibility } from "../../hooks/useDelayedVisibility";

import { useNodeFocusStore } from "../../stores/NodeFocusStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  CONTROL_HANDLE_ID,
  isAgentNodeType
} from "../../stores/graphEdgeToReactFlowEdge";
import useConnectionStore from "../../stores/ConnectionStore";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  CODE_NODE_TYPE,
  isCodeNode,
  isCodeNodeTitleEditable,
  resolveCodeNodeTitle
} from "./codeNodeUi";
import { isContentCardNode } from "../node_types/contentCardRegistry";
import {
  CONSTANT_IMAGE_NODE_TYPE,
  CONSTANT_VIDEO_NODE_TYPE
} from "../../constants/nodeTypes";

// CONSTANTS
const BASE_HEIGHT = 0;
const INCREMENT_PER_HANDLE = 25;
/** Cap metadata-driven minHeight so many-handle types do not force huge boxes (collapse snapshot / RF measure). */
const MAX_HANDLE_DRIVEN_MIN_HEIGHT_PX = 320;
const MAX_NODE_WIDTH = 800;
const GROUP_COLOR_OPACITY = 0.55;
/** Shared floor for initial layout and user resizing. */
const MIN_NODE_HEIGHT = 150;
const SPECIAL_NAMESPACES = ["nodetool.constant", "nodetool.input", "nodetool.output"];

const isEmptyResult = (obj: unknown) =>
  obj && typeof obj === "object" && Object.keys(obj as object).length === 0;

const NODE_CONTENT_CONTAINER_STYLE: React.CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  width: "100%"
};

/** Collapsed: no side clip-path — clipping a zero-height box can hide sockets and confuse RF measurements */
const NODE_CONTENT_CONTAINER_COLLAPSED_STYLE: React.CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  width: "100%",
  overflow: "visible"
};

const ResizeOverlay = memo(function ResizeOverlay({
  minHeight
}: {
  minHeight: number;
}) {
  return (
    <div className="node-resizer">
      <div className="resizer">
        <NodeResizer
          shouldResize={(
            _event,
            params: ResizeParams & { direction: number[] }
          ) => {
            const [dirX, dirY] = params.direction;
            return dirX !== 0 || dirY !== 0;
          }}
          minWidth={200}
          maxWidth={MAX_NODE_WIDTH}
          minHeight={minHeight}
        />
      </div>
    </div>
  );
});

const TOOLBAR_SHOW_DELAY = 200; // ms delay before showing toolbar after selection

const Toolbar = memo(function Toolbar({
  id,
  selected,
  dragging
}: {
  id: string;
  selected: boolean;
  dragging?: boolean;
}) {
  const { activeSelect } = useSelect();
  const selectedCount = useNodes((state: NodeStoreState) =>
    state.getSelectedNodeCount()
  );

  // Delay showing toolbar to avoid flash when clicking to drag
  const delayedSelected = useDelayedVisibility({
    shouldBeVisible: selected && !dragging,
    delay: TOOLBAR_SHOW_DELAY
  });

  // Only show toolbar when exactly one node is selected
  const isVisible =
    delayedSelected && !activeSelect && !dragging && selectedCount === 1;
  return (
    <NodeToolbar position={Position.Top} offset={0} isVisible={isVisible}>
      <NodeToolButtons nodeId={id} />
    </NodeToolbar>
  );
});

/**
 * BaseNode renders a single node in the workflow
 *
 * @param props
 */

const gradientAnimationKeyframes = keyframes`
  from {
    --gradient-angle: 90deg;
  }
  to {
    --gradient-angle: 450deg;
  }
`;

// Ambient-liveness ring: a breathing halo shown when a node is executing in one
// or more runs the user is NOT currently focused on. Visually distinct from the
// primary running ring (a tight, rotating type-color conic gradient): this one
// is a single-hue halo that pulses opacity/scale, so "running in my focused run"
// and "also running elsewhere" read as different signals.
const ambientPulseKeyframes = keyframes`
  0% { opacity: 0.9; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.015); }
  100% { opacity: 0.9; transform: scale(1); }
`;

const getAmbientRingCss = (color: string) =>
  css({
    position: "absolute",
    inset: 0,
    borderRadius: "var(--rounded-node)",
    pointerEvents: "none",
    // Pure box-shadow halo (no fill), so it only paints outside the node body
    // regardless of stacking order — robust to whether the container is a
    // positioned ancestor.
    zIndex: 0,
    boxShadow: `0 0 0 2px ${color}, 0 0 16px 2px color-mix(in srgb, ${color} 55%, transparent)`,
    animation: `${ambientPulseKeyframes} 1.6s ease-in-out infinite`
  });

const getAmbientBadgeStyle = (theme: Theme): React.CSSProperties => ({
  position: "absolute",
  top: -8,
  right: -8,
  minWidth: 16,
  height: 16,
  boxSizing: "border-box",
  padding: "0 4px",
  display: "grid",
  placeItems: "center",
  borderRadius: BORDER_RADIUS.lg,
  backgroundColor: theme.vars.palette.secondary.main,
  color: theme.vars.palette.secondary.contrastText,
  border: `1px solid ${theme.vars.palette.c_node_bg}`,
  fontSize: "var(--fontSizeSmaller)",
  fontWeight: 600,
  lineHeight: 1,
  zIndex: 20,
  pointerEvents: "none"
});

const getNodeStyles = (colors: string[]) =>
  css({
    "&::before": {
      display: "none"
    },
    "&.loading": {
      position: "relative",
      "--glow-offset": "-4px",
      "--ring": "3px",

      "&::before": {
        opacity: 0,
        content: '""',
        display: "block",
        position: "absolute",
        top: "var(--glow-offset)",
        left: "var(--glow-offset)",
        right: "var(--glow-offset)",
        bottom: "var(--glow-offset)",
        background: `conic-gradient(
        from var(--gradient-angle),
        ${colors[0]},
        ${colors[1]},
        ${colors[2]},
        ${colors[3]},
        ${colors[4]},
        ${colors[0]}
      )`,
        borderRadius: "var(--rounded-node)",
        zIndex: -20,
        pointerEvents: "none",
        // Show only a thin ring (border area), not full fill
        // by excluding the content box via masks
        WebkitMask:
          "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        padding: "var(--ring)",
        backgroundClip: "border-box",
        animation: `${gradientAnimationKeyframes} 5s ease-in-out infinite`,
        transition: MOTION.opacity
      }
    },

    "&.is-loading::before": {
      opacity: 1
    }
  });

const getVisibleInputHandleCount = (
  metadata: NodeMetadata | undefined,
  data: NodeData
): number => {
  if (!metadata) {
    return 0;
  }
  const propertyNames = new Set(
    (metadata.properties ?? []).map((property) => property.name)
  );
  return resolveExposedInputNames(metadata, data).filter((name) =>
    propertyNames.has(name)
  ).length;
};

const getVisibleOutputHandleCount = (
  metadata: NodeMetadata | undefined,
  data: NodeData,
  isOutputNode: boolean
): number => {
  if (!metadata || isOutputNode) {
    return 0;
  }
  return (
    (metadata.outputs?.length ?? 0) +
    Object.keys(data.dynamic_outputs ?? {}).length
  );
};

const getStyleProps = (
  parentId: string | undefined,
  nodeType: {
    isInputNode: boolean;
    isOutputNode: boolean;
    isAgentNode: boolean;
  },
  isLoading: boolean,
  metadata: NodeMetadata | undefined,
  data: NodeData,
  collapsed: boolean | undefined
) => {
  const hasParent = Boolean(parentId);
  const handleCount = Math.max(
    getVisibleInputHandleCount(metadata, data),
    getVisibleOutputHandleCount(metadata, data, nodeType.isOutputNode)
  );
  const handleCountMin = BASE_HEIGHT + handleCount * INCREMENT_PER_HANDLE;
  // Cap metadata-driven minHeight so many-handle types do not force huge
  // boxes (collapse snapshot / RF measure).
  const minHeight = Math.max(
    MIN_NODE_HEIGHT,
    Math.min(handleCountMin, MAX_HANDLE_DRIVEN_MIN_HEIGHT_PX)
  );
  return {
    className: `base-node node-body
      ${hasParent ? "has-parent" : ""}
      ${collapsed ? "collapsed " : ""}
      ${nodeType.isInputNode ? " input-node" : ""}
      ${nodeType.isOutputNode ? " output-node" : ""}
      ${isLoading ? " loading is-loading" : " loading "}`
      .replace(/\s+/g, " ")
      .trim(),
    minHeight
  };
};

const getNodeColors = (metadata: NodeMetadata | undefined): string[] => {
  const outputColors = [
    ...new Set(
      metadata?.outputs?.map((output: OutputSlot) => colorForType(output.type.type)) ||
        []
    )
  ];
  const inputColors = [
    ...new Set(
      metadata?.properties?.map((input: Property) =>
        colorForType(input.type.type)
      ) || []
    )
  ];
  const allColors = [...outputColors];
  for (const color of inputColors) {
    if (!allColors.includes(color)) {
      allColors.push(color);
    }
  }
  while (allColors.length < 5) {
    allColors.push(allColors[allColors.length - 1]);
  }
  return allColors.slice(0, 5) as string[];
};

const getHeaderColors = (
  metadata: NodeMetadata,
  theme: Theme,
  nodeType: string
) => {
  // Override colors for input and output nodes
  if (nodeType.startsWith("nodetool.input.")) {
    const baseColor = theme.vars.palette.success.main;
    return {
      headerColor: baseColor,
      baseColor
    };
  }

  if (nodeType.startsWith("nodetool.output.")) {
    const baseColor = theme.vars.palette.info.main;
    return {
      headerColor: baseColor,
      baseColor
    };
  }

  const firstOutputType = metadata?.outputs?.[0]?.type?.type as
    | string
    | undefined;
  if (!firstOutputType) {
    return { headerColor: "", baseColor: "" };
  }

  const baseColor = colorForType(firstOutputType);

  return {
    headerColor: baseColor,
    baseColor
  };
};

const BaseNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const isDarkMode = useIsDarkMode();
  const { id, type, data, selected, parentId, dragging } = props;
  const { workflow_id, title } = data;
  // Subscribe directly to focusedNodeId with equality check to avoid re-renders
  const isFocused = useNodeFocusStore(
    (state: ReturnType<typeof useNodeFocusStore.getState>) =>
      state.focusedNodeId === id
  );
  const focusedIndicatorStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      top: -20,
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: theme.vars.palette.warning.main,
      color: theme.vars.palette.warning.contrastText,
      padding: "2px 8px",
      borderRadius: BORDER_RADIUS.sm,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      zIndex: 1000
    }),
    [theme.vars.palette.warning.main, theme.vars.palette.warning.contrastText]
  );
  const updateNode = useNodes((state: NodeStoreState) => state.updateNode);
  const hasParent = Boolean(parentId);
  const [showResultOverlay, setShowResultOverlay] = useState(false);
  const initialRenderRef = useRef(true);
  const suppressResultOverlay = type === "nodetool.constant.Model3D";
  const nodeType = useMemo(
    () => ({
      isConstantNode: type.startsWith("nodetool.constant"),
      isInputNode: type.startsWith("nodetool.input"),
      isOutputNode: type.startsWith("nodetool.output"),
      isAgentNode: isAgentNodeType(type)
    }),
    [type]
  );
  // Status
  const statusValue = useNodeStatus(workflow_id, id);
  const status =
    statusValue && typeof statusValue !== "object"
      ? statusValue
      : undefined;
  const isLoading = useMemo(
    () => status === "running" || status === "starting" || status === "booting",
    [status]
  );

  // Ambient liveness: how many *other* (non-focused) runs are executing this
  // node right now. Drives a secondary ring + count badge so the canvas signals
  // work happening in runs the user is not currently focused on.
  const otherActiveRunCount = useNodeActiveRunCount(workflow_id, id);
  // Total runs executing this node right now: the non-focused active runs plus
  // the focused run when it's the one driving the primary animation.
  const concurrentRunCount = otherActiveRunCount + (isLoading ? 1 : 0);
  // Badge shows the concurrency count, but only once ≥2 runs hit this node — a
  // lone run needs no number (the ring/animation already says "running").
  const showConcurrencyBadge = concurrentRunCount >= 2;
  // Ambient ring marks a node active in a non-focused run when the primary
  // (focused-run) ring isn't already drawn, so two rings never stack.
  const showAmbientRing = otherActiveRunCount > 0 && !isLoading;
  const ambientRingCss = useMemo(
    () => getAmbientRingCss(theme.vars.palette.secondary.main),
    [theme.vars.palette.secondary.main]
  );
  const ambientBadgeStyle = useMemo(() => getAmbientBadgeStyle(theme), [theme]);

  // Metadata
  const metadata = useMetadataStore((state) => state.getMetadata(type));
  if (!metadata) {
    throw new Error("Metadata is not loaded for node type " + type);
  }

  const parentColor = parentId
    ? isDarkMode
      ? hexToRgba("#222", GROUP_COLOR_OPACITY)
      : hexToRgba("#ccc", GROUP_COLOR_OPACITY)
    : null;

  const meta = useMemo(() => {
    return {
      nodeNamespace: metadata.namespace || "",
      showFooter: !SPECIAL_NAMESPACES.includes(metadata.namespace || "")
    };
  }, [metadata.namespace]);

  // Nodes that preview media (image/video) resize by keeping the *media's*
  // aspect ratio, not the whole node box — the corner handle measures the live
  // image and the surrounding chrome (header, sliders, outputs) at drag time.
  // Output/preview nodes opt in too: they free-resize until media is present.
  const hasMediaView = useMemo(() => {
    if (
      nodeType.isOutputNode ||
      type === CONSTANT_IMAGE_NODE_TYPE ||
      type === CONSTANT_VIDEO_NODE_TYPE
    ) {
      return true;
    }
    return (metadata.outputs ?? []).some((output) => {
      const outputType = output.type?.type;
      return outputType === "image" || outputType === "video";
    });
  }, [nodeType.isOutputNode, type, metadata.outputs]);

  const displayTitle = useMemo(
    () => resolveCodeNodeTitle(type, data.title, metadata.title),
    [data.title, metadata.title, type]
  );
  const showCodeBadge = isCodeNode(type);
  const isCodeTitleEditable = isCodeNodeTitleEditable(type, data);

  // Style
  const styleProps = useMemo(
    () =>
      getStyleProps(
        parentId,
        nodeType,
        isLoading,
        metadata,
        data,
        data.collapsed
      ),
    [parentId, nodeType, isLoading, metadata, data]
  );

  // Single subscription instead of 5 — one listener per node instead of five
  const { result, chunk, terminal, toolCall, planningUpdate, task } =
    useNodeArtifacts(workflow_id, id);

  // Optimize: Use memoized selectors that only perform O(E) filter operations when the
  // state.edges array reference actually changes (e.g. adding/removing edges), rather than
  // on every store update (like during 60fps node drag operations).
  // Returning primitive booleans prevents this node from re-rendering when unrelated edges change.
  const hasConnectedInputSelector = useMemo(() => {
    let lastEdges: Edge[] | null = null;
    let lastResult = false;
    return (state: NodeStoreState) => {
      if (state.edges === lastEdges) {
        return lastResult;
      }
      lastEdges = state.edges;
      lastResult = state.edges.some((edge: Edge) => edge.target === id);
      return lastResult;
    };
  }, [id]);
  const hasConnectedInput = useNodes(hasConnectedInputSelector);

  const hasControlEdgeSelector = useMemo(() => {
    let lastEdges: Edge[] | null = null;
    let lastResult = false;
    return (state: NodeStoreState) => {
      if (state.edges === lastEdges) {
        return lastResult;
      }
      lastEdges = state.edges;
      lastResult = state.edges.some(
        (edge: Edge) => edge.target === id && edge.targetHandle === CONTROL_HANDLE_ID
      );
      return lastResult;
    };
  }, [id]);
  const hasControlEdge = useNodes(hasControlEdgeSelector);

  // Show control handle when dragging a control edge from an Agent node
  const isCreatingControlEdge = useConnectionStore(
    (state: ReturnType<typeof useConnectionStore.getState>) => {
      return (
        state.connectType?.type === "control" &&
        state.connectDirection === "source"
      );
    }
  );

  const isConstantInputLockedResult =
    nodeType.isConstantNode && hasConnectedInput;

  const usesContentCardBody = isContentCardNode(metadata);

  // Only auto-switch to result view for generative nodes (marked via
  // `auto_save_asset` by providers like fal, kie, replicate, elevenlabs,
  // gemini/openai image+audio, etc.). Non-generative nodes with visual
  // outputs (e.g. pass-through image transforms) keep the inputs view
  // visible until the user explicitly clicks the results toggle.
  const isGenerativeNode = Boolean(metadata?.auto_save_asset);

  // Manage overlay visibility based on node status, result, and user preference
  useEffect(() => {
    if (suppressResultOverlay) {
      setShowResultOverlay(false);
      return;
    }
    // Reset overlay when node starts running again
    if (status === "running" || status === "starting") {
      setShowResultOverlay(false);
    }
    // Constant nodes with connected input are always locked to results view.
    else if (result && isConstantInputLockedResult) {
      setShowResultOverlay(true);
    }
    // Other constant nodes default to showing results when available,
    // unless user explicitly switched back to inputs.
    else if (
      result &&
      nodeType.isConstantNode &&
      data.showResultPreference !== false
    ) {
      setShowResultOverlay(true);
    }
    // When a generative node completes, show the rendered result by default
    // (unless the user explicitly opted out). Non-generative nodes stay on
    // their inputs view — users can toggle results manually via the header.
    else if (
      result &&
      isGenerativeNode &&
      !usesContentCardBody &&
      !nodeType.isOutputNode &&
      !nodeType.isConstantNode &&
      status === "completed"
    ) {
      if (data.showResultPreference !== false) {
        setShowResultOverlay(true);
      }
    }
  }, [
    result,
    isConstantInputLockedResult,
    isGenerativeNode,
    usesContentCardBody,
    nodeType.isOutputNode,
    nodeType.isConstantNode,
    status,
    data.showResultPreference,
    suppressResultOverlay
  ]);

  const shouldAlwaysShowResult =
    !usesContentCardBody &&
    !suppressResultOverlay &&
    (nodeType.isOutputNode || isConstantInputLockedResult);
  const isOverlayVisible =
    suppressResultOverlay || usesContentCardBody
      ? false
      : shouldAlwaysShowResult
      ? Boolean(result && !isEmptyResult(result))
      : Boolean(showResultOverlay && result && !isEmptyResult(result));
  const hasToggleableResult =
    !usesContentCardBody &&
    !suppressResultOverlay &&
    !shouldAlwaysShowResult &&
    result &&
    !isEmptyResult(result);

  // Node metadata and properties
  const nodeColors = useMemo(() => getNodeColors(metadata), [metadata]);

  const { headerColor, baseColor } = useMemo(
    () => getHeaderColors(metadata, theme, type),
    [metadata, theme, type]
  );

  // Use useMemo to cache the styles based on nodeColors
  const styles = useMemo(() => getNodeStyles(nodeColors), [nodeColors]);
  const toolCallStyles = useMemo(
    () =>
      css({
        ".tool-call-container": {
          margin: "0.5em 1em",
          padding: "0.5em",
          background: "rgba(33, 150, 243, 0.1)",
          borderRadius: BORDER_RADIUS.sm,
          border: `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.2)`,
          fontSize: "0.75em",
          color: theme.vars.palette.primary.light,
          wordBreak: "break-word"
        }
      }),
    [theme]
  );

  // Memoize the container sx prop to prevent object recreation on every render
  const containerSx = useMemo(
    () =>
      getBaseNodeSelectionStyles({
        selected,
        isFocused,
        isLoading,
        hasAmbientRing: showAmbientRing,
        hasParent,
        hasToggleableResult: Boolean(hasToggleableResult),
        baseColor,
        parentColor,
        theme,
        minHeight: styleProps.minHeight,
        collapsed: Boolean(data.collapsed)
      }),
    [
      selected,
      isFocused,
      isLoading,
      showAmbientRing,
      hasParent,
      hasToggleableResult,
      baseColor,
      parentColor,
      theme,
      styleProps.minHeight,
      data.collapsed
    ]
  );

  const nodeContentContainerStyle = useMemo<React.CSSProperties>(
    () =>
      data.collapsed
        ? NODE_CONTENT_CONTAINER_COLLAPSED_STYLE
        : NODE_CONTENT_CONTAINER_STYLE,
    [data.collapsed]
  );

  // Track error state for node dimension management
  const hasError = useNodeHasError(workflow_id, id);

  // Hover-reveal of all handle tooltips. The user can hover the node body
  // to see every input/output port's name without hovering each handle one
  // by one. A short delay filters out incidental mouse-passes during pan.
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const HOVER_REVEAL_DELAY = 180;

  const handleNodeMouseEnter = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setIsNodeHovered(true);
      hoverTimerRef.current = null;
    }, HOVER_REVEAL_DELAY);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsNodeHovered(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Force node re-measurement when content that affects height changes
  // (error messages appearing/disappearing, result overlay toggling).
  // Without this, React Flow's cached handle positions become stale.
  // Uses requestAnimationFrame to let the DOM settle before React Flow
  // re-measures, ensuring handle positions are read from final layout.
  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }
    // Wait one frame for DOM to settle, then reset measured dimensions
    // so React Flow re-measures the node and recalculates handle positions
    const rafId = requestAnimationFrame(() => {
      updateNode(id, { height: undefined, measured: undefined });
    });
    return () => cancelAnimationFrame(rafId);
  }, [hasError, isOverlayVisible, id, updateNode]);

  return (
    <NodeSelectionContext.Provider value={selected || isNodeHovered}>
    <Container
      css={isLoading ? [toolCallStyles, styles] : toolCallStyles}
      className={`${styleProps.className}${terminal ? " has-terminal" : ""}`}
      sx={containerSx}
      onMouseEnter={handleNodeMouseEnter}
      onMouseLeave={handleNodeMouseLeave}
    >
      <Handle
        type="target"
        id={CONTROL_HANDLE_ID}
        position={Position.Top}
        className={`control-handle control-handle-top ${hasControlEdge || isCreatingControlEdge ? "control-handle-visible" : "control-handle-hidden"}`}
        isConnectable={true}
      />
      {selected && <Toolbar id={id} selected={selected} dragging={dragging} />}
      <NodeResizeHandle
        minWidth={150}
        minHeight={styleProps.minHeight}
        nodeId={id}
        contentAware={hasMediaView}
      />
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={headerColor}
        title={displayTitle}
        metadataTitle={metadata.title}
        hasParent={hasParent}
        iconType={
          metadata?.outputs?.[0]?.type?.type ??
          metadata?.properties?.[0]?.type?.type ??
          "any"
        }
        iconBaseColor={baseColor}
        workflowId={workflow_id}
        isTitleEditable={isCodeTitleEditable}
        showCodeBadge={showCodeBadge}
        codeBadgeTooltip="Code node"
      />
      <NodeErrors id={id} workflow_id={workflow_id} nodeType={type} />
      {!hasError && metadata?.required_runtimes && metadata.required_runtimes.length > 0 && (
        <NodeDependencyWarning requiredRuntimes={metadata.required_runtimes} />
      )}
      <NodeStatus status={status} />
      <NodeExecutionTime nodeId={id} workflowId={workflow_id} status={status} />
      <ApiKeyValidation nodeNamespace={meta.nodeNamespace} />
      <RequiredSettingsWarning nodeType={type} />
      <InputNodeNameWarning
        nodeType={type}
        name={data.properties?.name as string | undefined}
      />
      <div
        className="node-content-container"
        style={nodeContentContainerStyle}
      >
        <NodeContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          isOutputNode={nodeType.isOutputNode}
          data={data}
          status={status}
          workflowId={workflow_id}
        />
      </div>

      {/* Default behavior: width-only resize for regular nodes.
          If a node has toggleable result rendering, it uses the Preview-style corner handle instead. */}
      {selected && !hasToggleableResult && (
        <ResizeOverlay minHeight={styleProps.minHeight} />
      )}
      {!terminal && toolCall?.message && status === "running" && (
        <div className="tool-call-container">{toolCall.message}</div>
      )}
      {!terminal && planningUpdate && !task && (
        <PlanningUpdateDisplay planningUpdate={planningUpdate} />
      )}
      {!terminal && chunk && <ChunkDisplay chunk={chunk} />}
      {/* Terminal-driving nodes (e.g. Claude Code) stream their raw pane via
          terminal_update. It renders below the input/output handles so the
          emulator never displaces them from their natural edge positions. */}
      {terminal && <NodeTerminal terminal={terminal} />}
      {task && <TaskView task={task} />}

      {/* Agent control output handle - positioned at the bottom of Agent nodes */}
      {nodeType.isAgentNode && (
        <Handle
          type="source"
          id={CONTROL_HANDLE_ID}
          position={Position.Bottom}
          className="control-handle control-handle-bottom"
          isConnectable={true}
        />
      )}

      {isFocused && (
        <div style={focusedIndicatorStyle}>
          FOCUSED
        </div>
      )}

      {showAmbientRing && (
        <div
          className="node-ambient-ring"
          css={ambientRingCss}
          aria-hidden="true"
        />
      )}
      {showConcurrencyBadge && (
        <div
          style={ambientBadgeStyle}
          title={`Running in ${concurrentRunCount} runs at once`}
        >
          {concurrentRunCount}
        </div>
      )}

      {title && type !== CODE_NODE_TYPE && (
        <EditableTitle nodeId={id} title={title} />
      )}

      <FalPricingFooter metadata={metadata} selected={!!selected} />
      <KieCreditsFooter
        metadata={metadata}
        selected={!!selected}
        nodeId={id}
        workflowId={workflow_id}
      />
    </Container>
    </NodeSelectionContext.Provider>
  );
};

export default memo(BaseNode, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.type === nextProps.type &&
    prevProps.selected === nextProps.selected &&
    prevProps.dragging === nextProps.dragging &&
    prevProps.parentId === nextProps.parentId &&
    isEqual(prevProps.data, nextProps.data)
  );
});
