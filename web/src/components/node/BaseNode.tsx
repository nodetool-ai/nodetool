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
import isEqual from "lodash/isEqual";
import { Button, Container, Tooltip } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "./NodeHeader";
import { NodeErrors } from "./NodeErrors";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import useErrorStore from "../../stores/ErrorStore";
import ModelRecommendations from "./ModelRecommendations";
import ApiKeyValidation from "./ApiKeyValidation";
import InputNodeNameWarning from "./InputNodeNameWarning";
import RequiredSettingsWarning from "./RequiredSettingsWarning";
import NodeStatus from "./NodeStatus";
import NodeContent from "./NodeContent";
import NodeToolButtons from "./NodeToolButtons";
import NodeExecutionTime from "./NodeExecutionTime";
import { hexToRgba } from "../../utils/ColorUtils";
import useMetadataStore from "../../stores/MetadataStore";
import useSelect from "../../hooks/nodes/useSelect";
import EditableTitle from "./EditableTitle";
import { NodeMetadata } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
import PlanningUpdateDisplay from "./PlanningUpdateDisplay";
import ChunkDisplay from "./ChunkDisplay";
import NodeResizeHandle from "./NodeResizeHandle";
import { useDelayedVisibility } from "../../hooks/useDelayedVisibility";

import { getIsElectronDetails } from "../../utils/browser";
import { Box } from "@mui/material";
import { useNodeFocusStore } from "../../stores/NodeFocusStore";
import { useNodes } from "../../contexts/NodeContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { isProduction } from "../../stores/ApiClient";
import {
  CONTROL_HANDLE_ID,
  isAgentNodeType
} from "../../stores/graphEdgeToReactFlowEdge";
import useConnectionStore from "../../stores/ConnectionStore";
import type { NodeStoreState } from "../../stores/NodeStore";

// CONSTANTS
const BASE_HEIGHT = 0; // Minimum height for the node
const INCREMENT_PER_OUTPUT = 25; // Height increase per output in the node
const MAX_NODE_WIDTH = 600;
const GROUP_COLOR_OPACITY = 0.55;
const MIN_NODE_HEIGHT = 100;

const resizer = (
  <div className="node-resizer">
    <div className="resizer">
      <NodeResizer
        shouldResize={(
          event,
          params: ResizeParams & { direction: number[] }
        ) => {
          const [dirX, dirY] = params.direction;
          // Allow both horizontal and vertical resizing
          return dirX !== 0 || dirY !== 0;
        }}
        minWidth={200}
        maxWidth={MAX_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
      />
    </div>
  </div>
);

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
        transition: "opacity 0.5s ease-in-out"
      }
    },

    "&.is-loading::before": {
      opacity: 1
    }
  });

const getStyleProps = (
  parentId: string | undefined,
  nodeType: { isInputNode: boolean; isOutputNode: boolean },
  isLoading: boolean,
  metadata: any
) => {
  const hasParent = Boolean(parentId);
  return {
    className: `base-node node-body
      ${hasParent ? "has-parent" : ""}
      ${nodeType.isInputNode ? " input-node" : ""}
      ${nodeType.isOutputNode ? " output-node" : ""}
      ${isLoading ? " loading is-loading" : " loading "}`
      .replace(/\s+/g, " ")
      .trim(),
    minHeight: metadata
      ? BASE_HEIGHT + (metadata.outputs?.length ?? 0) * INCREMENT_PER_OUTPUT
      : BASE_HEIGHT
  };
};

const getNodeColors = (metadata: any): string[] => {
  const outputColors = [
    ...new Set(
      metadata?.outputs?.map((output: any) => colorForType(output.type.type)) ||
        []
    )
  ];
  const inputColors = [
    ...new Set(
      metadata?.properties?.map((input: any) =>
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

// Memoized function to generate node container styles
const getNodeContainerStyles = (
  isLoading: boolean,
  selected: boolean,
  isFocused: boolean,
  hasParent: boolean,
  hasToggleableResult: boolean,
  baseColor: string | undefined,
  parentColor: string | null,
  theme: Theme,
  minHeight: number
) => ({
  display: "flex" as const,
  // Important for resizable nodes:
  // ReactFlow applies width/height to the wrapper. Ensure our visual container
  // stretches to match so vertical resizing is visible.
  height: "100%",
  minHeight,
  border: isLoading ? "none" : `1px solid var(--palette-grey-900)`,
  ...theme.applyStyles("dark", {
    border: isLoading ? "none" : `1px solid var(--palette-grey-900)`
  }),
  boxShadow: selected
    ? `0 0 0 1px ${baseColor || "#666"}, 0 1px 10px rgba(0,0,0,0.5)`
    : isFocused
      ? `0 0 0 2px ${theme.vars.palette.warning.main}`
      : "none",
  outline: isFocused
    ? `2px dashed ${theme.vars.palette.warning.main}`
    : selected
      ? `3px solid ${baseColor || "#666"}`
      : "none",
  outlineOffset: "-2px",
  backgroundColor:
    hasParent && !isLoading
      ? parentColor
      : selected
        ? "transparent !important"
        : theme.vars.palette.c_node_bg,
  backdropFilter: selected ? theme.vars.palette.glass.blur : "none",
  WebkitBackdropFilter: selected ? theme.vars.palette.glass.blur : "none",
  borderRadius: "var(--rounded-node)",
  // dynamic node color
  "--node-primary-color": baseColor || "var(--palette-primary-main)",
  ...(hasToggleableResult
    ? {
        // show the corner resize handle on hover
        "& .react-flow__resize-control.nodrag.bottom.right.handle": {
          opacity: 0,
          position: "absolute" as const,
          right: "-8px",
          bottom: "-9px",
          transition: "opacity 0.2s"
        },
        "&:hover .react-flow__resize-control.nodrag.bottom.right.handle": {
          opacity: 1
        }
      }
    : {})
});

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
  const updateNodeData = useNodes(
    (state: NodeStoreState) => state.updateNodeData
  );
  const updateNode = useNodes((state: NodeStoreState) => state.updateNode);
  const hasParent = Boolean(parentId);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [showResultOverlay, setShowResultOverlay] = useState(false);
  const initialRenderRef = useRef(true);
  const nodeType = useMemo(
    () => ({
      isConstantNode: type.startsWith("nodetool.constant"),
      isInputNode: type.startsWith("nodetool.input"),
      isOutputNode:
        type.startsWith("nodetool.output") ||
        type === "comfy.image.SaveImage" ||
        type === "comfy.image.PreviewImage",
      isAgentNode: isAgentNodeType(type)
    }),
    [type]
  );
  // Status
  const statusValue = useStatusStore((state) =>
    state.getStatus(workflow_id, id)
  );
  const status =
    statusValue && statusValue !== null && typeof statusValue !== "object"
      ? statusValue
      : undefined;
  const isLoading = useMemo(
    () => status === "running" || status === "starting" || status === "booting",
    [status]
  );

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

  const specialNamespaces = useMemo(
    () => ["nodetool.constant", "nodetool.input", "nodetool.output"],
    []
  );

  const meta = useMemo(() => {
    return {
      nodeNamespace: metadata.namespace || "",
      nodeBasicFields: metadata.basic_fields || [],
      hasAdvancedFields:
        (metadata.properties?.length ?? 0) >
        (metadata.basic_fields?.length ?? 0),
      showFooter: !specialNamespaces.includes(metadata.namespace || "")
    };
  }, [
    metadata.basic_fields,
    metadata.namespace,
    metadata.properties?.length,
    specialNamespaces
  ]);

  // Style
  const styleProps = useMemo(
    () => getStyleProps(parentId, nodeType, isLoading, metadata),
    [parentId, nodeType, isLoading, metadata]
  );

  // Results and rendering
  const result = useResultsStore((state) => {
    const r =
      state.getOutputResult(workflow_id, id) ||
      state.getResult(workflow_id, id);
    return r;
  });

  // Optimize: Use a more specific selector that only depends on the node's connected edges
  // This prevents re-renders when unrelated edges change
  const hasConnectedInput = useNodes((state: NodeStoreState) => {
    // Check if any edge targets this node
    // This selector will only re-render when edges array reference changes
    // AND the connection status of this specific node changes
    return state.edges.some((edge: Edge) => edge.target === id);
  });

  // Check if this node has an incoming control edge (to show the control handle)
  const hasControlEdge = useNodes((state: NodeStoreState) => {
    return state.edges.some(
      (edge: Edge) => edge.target === id && edge.targetHandle === CONTROL_HANDLE_ID
    );
  });

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

  // Manage overlay visibility based on node status, result, and user preference
  useEffect(() => {
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
    // When node completes with result, respect user's saved preference
    // for regular non-output nodes.
    else if (
      result &&
      !nodeType.isOutputNode &&
      !nodeType.isConstantNode &&
      status === "completed"
    ) {
      // Only show result overlay if user has explicitly saved that preference
      if (data.showResultPreference === true) {
        setShowResultOverlay(true);
      }
      // Otherwise stay on inputs view (default behavior)
    }
  }, [
    result,
    isConstantInputLockedResult,
    nodeType.isOutputNode,
    nodeType.isConstantNode,
    status,
    data.showResultPreference
  ]);

  const handleShowInputs = useCallback(() => {
    if (isConstantInputLockedResult) {
      return;
    }
    setShowResultOverlay(false);
    // Save preference: user wants to see inputs after workflow runs
    updateNodeData(id, { showResultPreference: false });
  }, [isConstantInputLockedResult, id, updateNodeData]);

  const handleShowResults = useCallback(() => {
    setShowResultOverlay(true);
    // Save preference: user wants to see results after workflow runs
    updateNodeData(id, { showResultPreference: true });
  }, [id, updateNodeData]);

  // Compute if overlay is actually visible (mirrors logic in NodeContent)
  const isEmptyResult = (obj: unknown) =>
    obj && typeof obj === "object" && Object.keys(obj as object).length === 0;
  const shouldAlwaysShowResult =
    nodeType.isOutputNode || isConstantInputLockedResult;
  const isOverlayVisible = shouldAlwaysShowResult
    ? result && !isEmptyResult(result)
    : showResultOverlay && result && !isEmptyResult(result);
  const hasToggleableResult =
    !shouldAlwaysShowResult && result && !isEmptyResult(result);

  const chunk = useResultsStore((state) => state.getChunk(workflow_id, id));
  const toolCall = useResultsStore((state) =>
    state.getToolCall(workflow_id, id)
  );
  const planningUpdate = useResultsStore((state) =>
    state.getPlanningUpdate(workflow_id, id)
  );

  // Node metadata and properties
  const nodeColors = useMemo(() => getNodeColors(metadata), [metadata]);

  const { headerColor, baseColor } = useMemo(
    () => getHeaderColors(metadata, theme, type),
    [metadata, theme, type]
  );

  const task = useResultsStore((state) => state.getTask(workflow_id, id));

  // Use useMemo to cache the styles based on nodeColors
  const styles = useMemo(() => getNodeStyles(nodeColors), [nodeColors]);
  const toolCallStyles = useMemo(
    () =>
      css({
        ".tool-call-container": {
          margin: "0.5em 1em",
          padding: "0.5em",
          background: "rgba(33, 150, 243, 0.1)",
          borderRadius: "4px",
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
      getNodeContainerStyles(
        isLoading,
        selected,
        isFocused,
        hasParent,
        Boolean(hasToggleableResult),
        baseColor,
        parentColor,
        theme,
        styleProps.minHeight
      ),
    [
      isLoading,
      selected,
      isFocused,
      hasParent,
      hasToggleableResult,
      baseColor,
      parentColor,
      theme,
      styleProps.minHeight
    ]
  );

  if (!metadata) {
    throw new Error("Metadata is not loaded for node " + id);
  }

  const onToggleAdvancedFields = useCallback(() => {
    setShowAdvancedFields(!showAdvancedFields);
    // Reset node height to auto-size when toggling advanced fields
    updateNode(id, { height: undefined, measured: undefined });
  }, [showAdvancedFields, updateNode, id]);

  const handleNamespaceClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Open nodeMenu at that namespace
      const namespacePath = metadata.namespace?.split(".") || [];
      useNodeMenuStore.getState().openNodeMenu({
        x: e.clientX,
        y: e.clientY,
        selectedPath: namespacePath
      });
    },
    [metadata.namespace]
  );

  // Track error state for node dimension management
  const hasError = useErrorStore((state) =>
    workflow_id !== undefined ? !!state.getError(workflow_id, id) : false
  );

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
    <Container
      css={isLoading ? [toolCallStyles, styles] : toolCallStyles}
      className={styleProps.className}
      sx={containerSx}
    >
      <Handle
        type="target"
        id={CONTROL_HANDLE_ID}
        position={Position.Top}
        className={`control-handle control-handle-top ${hasControlEdge || isCreatingControlEdge ? "control-handle-visible" : "control-handle-hidden"}`}
        isConnectable={true}
      />
      {selected && <Toolbar id={id} selected={selected} dragging={dragging} />}
      <NodeResizeHandle minWidth={150} minHeight={150} />
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={headerColor}
        metadataTitle={metadata.title}
        hasParent={hasParent}
        iconType={metadata?.outputs?.[0]?.type?.type}
        iconBaseColor={baseColor}
        workflowId={workflow_id}
        showResultButton={Boolean(!isOverlayVisible && hasToggleableResult)}
        showInputsButton={Boolean(isOverlayVisible && hasToggleableResult)}
        onShowResults={handleShowResults}
        onShowInputs={handleShowInputs}
      />
      <NodeErrors id={id} workflow_id={workflow_id} />
      <NodeStatus status={status} />
      <NodeExecutionTime nodeId={id} workflowId={workflow_id} status={status} />
      {!isOverlayVisible &&
        (getIsElectronDetails().isElectron || !isProduction) && (
          <ModelRecommendations nodeType={type} />
        )}
      <ApiKeyValidation nodeNamespace={meta.nodeNamespace} />
      <RequiredSettingsWarning nodeType={type} />
      <InputNodeNameWarning
        nodeType={type}
        name={data.properties?.name as string | undefined}
      />
      <Box
        className="node-content-container"
        sx={{
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          overflow: "visible", // Allow handles to render outside bounds
          clipPath: "inset(0 -20px)" // Clip top/bottom, extend left/right for handles
        }}
      >
        <NodeContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          isOutputNode={nodeType.isOutputNode}
          data={data}
          hasAdvancedFields={meta.hasAdvancedFields}
          showAdvancedFields={showAdvancedFields}
          onToggleAdvancedFields={onToggleAdvancedFields}
          basicFields={meta.nodeBasicFields}
          status={status}
          workflowId={workflow_id}
          showResultOverlay={
            isConstantInputLockedResult ? true : showResultOverlay
          }
          result={result}
          onShowInputs={handleShowInputs}
          onShowResults={handleShowResults}
        />
      </Box>

      {/* Default behavior: width-only resize for regular nodes.
          If a node has toggleable result rendering, it uses the Preview-style corner handle instead. */}
      {selected && !hasToggleableResult && resizer}
      {toolCall?.message && status === "running" && (
        <div className="tool-call-container">{toolCall.message}</div>
      )}
      {planningUpdate && !task && (
        <PlanningUpdateDisplay planningUpdate={planningUpdate} />
      )}
      {chunk && <ChunkDisplay chunk={chunk} />}
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
        <Box
          sx={{
            position: "absolute",
            top: -20,
            left: "50%",
            transform: "translateX(-50%)",
            bgcolor: theme.vars.palette.warning.main,
            color: theme.vars.palette.warning.contrastText,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: "0.7rem",
            fontWeight: "bold",
            zIndex: 1000,
            boxShadow: 2
          }}
        >
          FOCUSED
        </Box>
      )}

      {title && <EditableTitle nodeId={id} title={title} />}

      {selected && metadata.namespace && (
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY * 2}
          title="Open Node Menu here"
          placement="bottom"
          arrow
        >
          <Button
            variant="text"
            className="node-namespace nodrag nopan"
            onClick={handleNamespaceClick}
            sx={{
              position: "absolute",
              bottom: -25,
              left: "50%",
              transform: "translateX(-50%)",
              bgcolor: "background.paper",
              color: "text.secondary",
              px: 1,
              py: 0.25,
              borderRadius: 1,
              fontSize: "0.65rem",
              fontWeight: 400,
              zIndex: 1000,
              border: "1px solid",
              borderColor: "divider",
              whiteSpace: "nowrap",
              cursor: "pointer",
              "&:hover": {
                bgcolor: "action.hover"
              }
            }}
          >
            {metadata.namespace}
          </Button>
        </Tooltip>
      )}
    </Container>
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
