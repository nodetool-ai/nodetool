import React, { memo, useMemo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { FlexColumn } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import { NodeData } from "../../../stores/NodeData";
import { NodeHeader } from "../NodeHeader";
import { NodeErrors } from "../NodeErrors";
import NodeStatus from "../NodeStatus";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeSelectionToolbar from "../NodeSelectionToolbar";
import NodeExecutionTime from "../NodeExecutionTime";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNodeStatus } from "../../../hooks/nodes/useNodeExecState";
import { useNodeFocusStore } from "../../../stores/NodeFocusStore";
import { SubgraphNodeContent } from "./SubgraphNodeContent";
import { SUBGRAPH_ACCENT_COLOR } from "../../../constants/nodeTypes";

/**
 * Dedicated React Flow node for SubgraphNode (inline sub-graph execution).
 * Inputs/outputs are derived from the inner Input/Output nodes stored in
 * `data.properties.graph`. Double-click opens the subgraph in a new tab.
 */
const SubgraphNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = props;
  const workflow_id = (data as NodeData & { workflow_id?: string }).workflow_id ?? "";
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const hasParent = Boolean(parentId);

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const statusRaw = useNodeStatus(workflow_id, id);
  const statusValue =
    statusRaw && typeof statusRaw !== "object"
      ? statusRaw
      : undefined;

  const headerTitle = useMemo(() => {
    if (!metadata) {
      return "Subgraph";
    }
    return data.title || metadata.title || "Subgraph";
  }, [metadata, data.title]);

  if (!metadata) {
    return null;
  }

  return (
    <FlexColumn
      className="subgraph-node"
      sx={{
        height: "100%",
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${SUBGRAPH_ACCENT_COLOR}40`,
        borderRadius: theme.rounded.node,
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${SUBGRAPH_ACCENT_COLOR}, 0 1px 10px rgba(0,0,0,0.5)`
          : isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": SUBGRAPH_ACCENT_COLOR
      }}
    >
      {selected && (
        <NodeSelectionToolbar
          id={id}
          selected={selected}
          dragging={dragging}
        />
      )}
      <NodeResizeHandle minWidth={150} minHeight={150} />
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={SUBGRAPH_ACCENT_COLOR}
        metadataTitle={headerTitle}
        hasParent={hasParent}
        iconType="workflow"
        iconBaseColor={SUBGRAPH_ACCENT_COLOR}
        workflowId={workflow_id}
      />
      <NodeErrors id={id} workflow_id={workflow_id} />
      <NodeStatus status={statusValue} />
      <NodeExecutionTime
        nodeId={id}
        workflowId={workflow_id}
        status={statusValue}
      />
      <FlexColumn
        className="node-content-container"
        sx={{
          flex: "1 1 auto",
          minHeight: 80,
          width: "100%"
        }}
      >
        <SubgraphNodeContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          data={data}
          status={statusValue}
          workflowId={workflow_id}
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(SubgraphNode);
