/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { colorForType } from "../../config/data_types";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Node,
  NodeProps,
  NodeResizer,
  NodeToolbar,
  Position,
  ResizeParams
} from "@xyflow/react";
import { isEqual } from "lodash";
import { Container, Box, Tooltip, Button } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "./NodeHeader";
import { NodeErrors } from "./NodeErrors";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import OutputRenderer from "./OutputRenderer";
import ModelRecommendations from "./ModelRecommendations";
import { isProduction } from "../../stores/ApiClient";
import ApiKeyValidation from "./ApiKeyValidation";
import NodeStatus from "./NodeStatus";
import NodeContent from "./NodeContent";
import NodeToolButtons from "./NodeToolButtons";
import { darkenHexColor, hexToRgba } from "../../utils/ColorUtils";
import useMetadataStore from "../../stores/MetadataStore";
import NodeFooter from "./NodeFooter";
import useSelect from "../../hooks/nodes/useSelect";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import EditableTitle from "./EditableTitle";
import { NodeMetadata } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
import PlanningUpdateDisplay from "./PlanningUpdateDisplay";
import ChunkDisplay from "./ChunkDisplay";
import { useNodes } from "../../contexts/NodeContext";

// Node sizing constants
const BASE_HEIGHT = 0; // Minimum height for the node
const INCREMENT_PER_OUTPUT = 25; // Height increase per output in the node
const MAX_NODE_WIDTH = 600;
const GROUP_COLOR_OPACITY = 0.55;

const resizer = (
  <div className="node-resizer">
    <div className="resizer">
      <NodeResizer
        shouldResize={(
          event,
          params: ResizeParams & { direction: number[] }
        ) => {
          const [dirX, dirY] = params.direction;
          return dirX !== 0 && dirY === 0;
        }}
        minWidth={100}
        maxWidth={MAX_NODE_WIDTH}
      />
    </div>
  </div>
);

const Toolbar = memo(function Toolbar({
  id,
  selected
}: {
  id: string;
  selected: boolean;
}) {
  const { activeSelect } = useSelect();
  if (activeSelect || !selected) return null;
  return (
    <NodeToolbar position={Position.Top} offset={0}>
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

// Move the styles definition outside the component
const getNodeStyles = (colors: string[]) =>
  css({
    "&.loading": {
      position: "relative",
      "--glow-offset": "-4px",
      "--ring": "3px",

      "&::before": {
        opacity: 0,
        content: '""',
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

// Style helper functions moved outside component
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
      ? BASE_HEIGHT + (metadata.outputs?.length || 0) * INCREMENT_PER_OUTPUT
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

const getHeaderColors = (metadata: NodeMetadata, theme: Theme, nodeType: string) => {
  // Override colors for input and output nodes
  if (nodeType.startsWith("nodetool.input.")) {
    const baseColor = "#4caf50"; // Green for input nodes
    return {
      headerColor: darkenHexColor(baseColor, 200),
      baseColor
    };
  }

  if (nodeType.startsWith("nodetool.output.")) {
    const baseColor = "#2196f3"; // Blue for output nodes
    return {
      headerColor: darkenHexColor(baseColor, 200),
      baseColor
    };
  }

  const firstOutputType = metadata?.outputs?.[0]?.type?.type as
    | string
    | undefined;
  if (!firstOutputType) return { headerColor: "", baseColor: "" };

  const baseColor = colorForType(firstOutputType);

  return {
    headerColor: darkenHexColor(baseColor, 200),
    baseColor
  };
};

const BaseNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const isDarkMode = useIsDarkMode();
  const { id, type, data, selected, parentId } = props;
  const { workflow_id, title } = data;
  const hasParent = Boolean(parentId);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const nodeType = useMemo(
    () => ({
      isConstantNode: type.startsWith("nodetool.constant"),
      isInputNode: type.startsWith("nodetool.input"),
      isOutputNode:
        type.startsWith("nodetool.output") ||
        type === "comfy.image.SaveImage" ||
        type === "comfy.image.PreviewImage"
    }),
    [type]
  );
  // Status
  const status = useStatusStore((state) => state.getStatus(workflow_id, id));
  const isLoading = useMemo(
    () => status === "running" || status === "starting" || status === "booting",
    [status]
  );

  // Metadata
  const metadata = useMetadataStore((state) => state.getMetadata(type));
  if (!metadata) {
    throw new Error("Metadata is not loaded for node type " + type);
  }

  const parentColor = useNodes((state) => {
    if (!parentId) return "";
    return isDarkMode
      ? hexToRgba("#222", GROUP_COLOR_OPACITY)
      : hexToRgba("#ccc", GROUP_COLOR_OPACITY);
  });

  const specialNamespaces = useMemo(
    () => ["nodetool.constant", "nodetool.input", "nodetool.output"],
    []
  );

  const meta = useMemo(() => {
    return {
      nodeNamespace: metadata.namespace || "",
      nodeBasicFields: metadata.basic_fields || [],
      hasAdvancedFields:
        (metadata.properties?.length || 0) >
        (metadata.basic_fields?.length || 0),
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
  const result = useResultsStore((state) => state.getResult(workflow_id, id));

  const renderedResult = useMemo(() => {
    return result && <OutputRenderer value={result} />;
  }, [result]);

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

  if (!metadata) {
    throw new Error("Metadata is not loaded for node " + id);
  }

  const onToggleAdvancedFields = useCallback(() => {
    setShowAdvancedFields(!showAdvancedFields);
  }, [showAdvancedFields]);

  return (
    <Container
      css={isLoading ? styles : undefined}
      className={styleProps.className}
      sx={{
        display: "flex",
        minHeight: styleProps.minHeight,
        border: isLoading
          ? "none"
          : `1px solid ${hexToRgba(baseColor || "#666", 0.4)}`,
        ...theme.applyStyles("dark", {
          border: isLoading
            ? "none"
            : `1px solid ${hexToRgba(baseColor || "#666", 0.4)}`
        }),
        backgroundColor:
          hasParent && !isLoading
            ? parentColor
            : hexToRgba(theme.vars.palette.c_node_bg as string, 0.6),
        backdropFilter: theme.vars.palette.glass.blur,
        WebkitBackdropFilter: theme.vars.palette.glass.blur,
        boxShadow: "0 0 24px -22px rgba(0,0,0,.65)",
        borderRadius: "var(--rounded-node)",
        // Set custom CSS property for dynamic selection color
        "--node-primary-color": baseColor || "var(--palette-primary-main)"
      }}
    >
      {selected && <Toolbar id={id} selected={selected} />}
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={headerColor}
        metadataTitle={metadata.title}
        hasParent={hasParent}
        iconType={metadata?.outputs?.[0]?.type?.type}
        iconBaseColor={baseColor}
      />
      <NodeErrors id={id} workflow_id={workflow_id} />
      <NodeStatus status={status} />
      {!isProduction && <ModelRecommendations nodeType={type} />}
      {!isProduction && <ApiKeyValidation nodeNamespace={meta.nodeNamespace} />}
      <NodeContent
        id={id}
        nodeType={type}
        nodeMetadata={metadata}
        isConstantNode={nodeType.isConstantNode}
        isOutputNode={nodeType.isOutputNode}
        data={data}
        hasAdvancedFields={meta.hasAdvancedFields}
        showAdvancedFields={showAdvancedFields}
        onToggleAdvancedFields={onToggleAdvancedFields}
        basicFields={meta.nodeBasicFields}
        status={status}
        workflowId={workflow_id}
        renderedResult={renderedResult}
      />

      {selected && resizer}
      {toolCall?.message && status === "running" && (
        <div className="tool-call-container">{toolCall.message}</div>
      )}
      {planningUpdate && !task && (
        <PlanningUpdateDisplay planningUpdate={planningUpdate} />
      )}
      {chunk && <ChunkDisplay chunk={chunk} />}
      {task && <TaskView task={task} />}
      {meta.showFooter && (
        <NodeFooter
          nodeNamespace={meta.nodeNamespace}
          metadata={metadata}
          nodeType={type}
        />
      )}

      {title && <EditableTitle nodeId={id} title={title} />}
    </Container>
  );
};

export default memo(BaseNode, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.type === nextProps.type &&
    prevProps.selected === nextProps.selected &&
    prevProps.parentId === nextProps.parentId &&
    isEqual(prevProps.data, nextProps.data)
  );
});
