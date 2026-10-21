import React, { useMemo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { FlexColumn, Box } from "../ui_primitives";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "./NodeHeader";
import { NodeErrors } from "./NodeErrors";
import NodeStatus from "./NodeStatus";
import NodeResizeHandle from "./NodeResizeHandle";
import NodeSelectionToolbar from "./NodeSelectionToolbar";
import NodeExecutionTime from "./NodeExecutionTime";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodeStatus, useNodeResultValue } from "../../hooks/nodes/useNodeExecState";
import { useNodeFocusStore } from "../../stores/NodeFocusStore";
import type { NodeMetadata } from "../../stores/ApiTypes";

interface SchemaNodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: NodeData;
  status?: string;
  workflowId: string;
  result?: unknown;
}

interface SchemaNodeLoaderProps {
  nodeId: string;
  data: NodeData;
}

interface DynamicSchemaNodeShellProps {
  nodeProps: NodeProps<Node<NodeData>>;
  className: string;
  accentColor: string;
  fallbackTitle: string;
  /** Model identifier appended to the header title. */
  titleDetail?: string;
  externalLink?: string;
  externalLinkTitle?: string;
  Loader: React.ComponentType<SchemaNodeLoaderProps>;
  Content: React.ComponentType<SchemaNodeContentProps>;
}

/** Shared React Flow chrome for the schema-driven provider nodes (fal, kie, replicate). */
export const DynamicSchemaNodeShell: React.FC<DynamicSchemaNodeShellProps> = ({
  nodeProps,
  className,
  accentColor,
  fallbackTitle,
  titleDetail,
  externalLink,
  externalLinkTitle,
  Loader,
  Content
}) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = nodeProps;
  const { workflow_id } = data;
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const hasParent = Boolean(parentId);

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const statusRaw = useNodeStatus(workflow_id, id);
  const statusValue =
    statusRaw && typeof statusRaw !== "object" ? statusRaw : undefined;
  const result = useNodeResultValue(workflow_id, id);

  const isConstantNode = type.startsWith("nodetool.constant");

  const headerTitle = useMemo(() => {
    const base = metadata?.title || fallbackTitle;
    return titleDetail ? `${base} · ${titleDetail}` : base;
  }, [metadata?.title, fallbackTitle, titleDetail]);

  if (!metadata) {
    return null;
  }

  return (
    <FlexColumn
      className={className}
      fullHeight
      sx={{
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${accentColor}40`,
        borderRadius: theme.rounded.node,
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${accentColor}, 0 1px 10px rgba(0,0,0,0.5)`
          : isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": accentColor
      }}
    >
      {selected && (
        <NodeSelectionToolbar
          id={id}
          selected={selected}
          dragging={dragging}
        />
      )}
      <NodeResizeHandle
        minWidth={150}
        minHeight={150}
        nodeId={id}
        contentAware
      />
      <Box sx={{ position: "relative" }}>
        <NodeHeader
          id={id}
          selected={selected}
          data={data}
          backgroundColor={accentColor}
          metadataTitle={headerTitle}
          hasParent={hasParent}
          iconType={metadata.outputs?.[0]?.type?.type}
          iconBaseColor={accentColor}
          workflowId={workflow_id}
          externalLink={externalLink}
          externalLinkTitle={externalLinkTitle}
        />
        <Box sx={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>
          <Loader nodeId={id} data={data} />
        </Box>
      </Box>
      <NodeErrors id={id} workflow_id={workflow_id} />
      <NodeStatus status={statusValue} />
      <NodeExecutionTime
        nodeId={id}
        workflowId={workflow_id}
        status={statusValue}
      />
      <FlexColumn
        className="node-content-container"
        fullWidth
        sx={{
          flex: "1 1 auto",
          minHeight: 120
        }}
      >
        <Content
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          isConstantNode={isConstantNode}
          isOutputNode={false}
          data={data}
          status={statusValue}
          workflowId={workflow_id}
          result={result}
        />
      </FlexColumn>
    </FlexColumn>
  );
};
