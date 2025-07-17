/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { colorForType } from "../../config/data_types";

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
import {
  darkenHexColor,
  hexToRgba,
  simulateOpacity
} from "../../utils/ColorUtils";
import useMetadataStore from "../../stores/MetadataStore";
import NodeFooter from "./NodeFooter";
import useSelect from "../../hooks/nodes/useSelect";
import NodePropertyForm from "./NodePropertyForm";
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
const GROUP_COLOR_OPACITY = 0.5;

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
        borderRadius: "inherit",
        zIndex: -20,
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
    className: `node-body 
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

const getHeaderFooterColors = (metadata: NodeMetadata, theme: any) => {
  const firstOutputColor = metadata?.outputs?.[0]?.type?.type;
  if (!firstOutputColor) return { headerColor: "", footerColor: "" };

  const baseColor = colorForType(firstOutputColor);
  const bg = theme.palette.c_node_bg;

  return {
    headerColor: darkenHexColor(simulateOpacity(baseColor, 0.6, bg), 90),
    footerColor: darkenHexColor(simulateOpacity(baseColor, 0.3, bg), 40)
  };
};

const BaseNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
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
    return hexToRgba("#333", GROUP_COLOR_OPACITY);
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
    return result && Object.keys(result).length > 0 ? (
      <OutputRenderer
        value={
          Array.isArray(result)
            ? result.map((i: any) => i.output)
            : result.output
        }
      />
    ) : null;
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

  const { headerColor, footerColor } = useMemo(
    () => getHeaderFooterColors(metadata, theme),
    [metadata, theme]
  );

  const task = useResultsStore((state) => state.getTask(workflow_id, id));

  // Use useMemo to cache the styles based on nodeColors
  const styles = useMemo(() => getNodeStyles(nodeColors), [nodeColors]);

  const { handleDeleteProperty, handleAddProperty, handleUpdatePropertyName } =
    useDynamicProperty(id, data.dynamic_properties as Record<string, any>);

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
      style={{
        display: "flex",
        minHeight: `${styleProps.minHeight}px`,
        border: theme.palette.mode === "light" ? "1px solid #ccc" : "none",
        backgroundColor:
          hasParent && !isLoading ? parentColor : theme.palette.c_node_bg
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
        onUpdatePropertyName={handleUpdatePropertyName}
        onDeleteProperty={handleDeleteProperty}
      />

      {metadata?.is_dynamic && (
        <NodePropertyForm onAddProperty={handleAddProperty} />
      )}
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
          backgroundColor={footerColor}
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
    isEqual(prevProps.data, nextProps.data)
  );
});
