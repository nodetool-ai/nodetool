import React, { memo, useMemo } from "react";
import { Node, NodeProps, NodeToolbar, Position } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { FlexColumn } from "../../ui_primitives";
import { NodeData } from "../../../stores/NodeData";
import { NodeHeader } from "../NodeHeader";
import { NodeErrors } from "../NodeErrors";
import NodeStatus from "../NodeStatus";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeToolButtons from "../NodeToolButtons";
import NodeExecutionTime from "../NodeExecutionTime";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNodeStatus } from "../../../hooks/nodes/useNodeExecState";
import { useNodes } from "../../../contexts/NodeContext";
import useSelect from "../../../hooks/nodes/useSelect";
import { useDelayedVisibility } from "../../../hooks/useDelayedVisibility";
import { useNodeFocusStore } from "../../../stores/NodeFocusStore";
import { WorkflowNodeContent } from "./WorkflowNodeContent";

const TOOLBAR_SHOW_DELAY = 200;

/** Accent color for WorkflowNode (blue-teal to distinguish from other node types) */
const WORKFLOW_HEADER_COLOR = "#0891B2";

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
  const selectedCount = useNodes((state) => state.getSelectedNodeCount());
  const delayedSelected = useDelayedVisibility({
    shouldBeVisible: selected && !dragging,
    delay: TOOLBAR_SHOW_DELAY
  });
  const isVisible =
    delayedSelected && !activeSelect && !dragging && selectedCount === 1;
  return (
    <NodeToolbar position={Position.Top} offset={0} isVisible={isVisible}>
      <NodeToolButtons nodeId={id} />
    </NodeToolbar>
  );
});

/**
 * Dedicated React Flow node for WorkflowNode (sub-workflow execution).
 * Displays a workflow selector and dynamically populates inputs/outputs
 * from the selected workflow's input and output nodes.
 */
const WorkflowNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = props;
  const { workflow_id } = data;
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
      return "Workflow";
    }
    const base = data.title || metadata.title || "Workflow";
    const workflowName = (
      data.properties?.workflow_json as Record<string, unknown> | undefined
    )?.name as string | undefined;
    return workflowName ? `${base} · ${workflowName}` : base;
  }, [metadata, data.title, data.properties?.workflow_json]);

  if (!metadata) {
    return null;
  }

  return (
    <FlexColumn
      className="workflow-node"
      fullHeight
      sx={{
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${WORKFLOW_HEADER_COLOR}40`,
        borderRadius: "var(--rounded-node)",
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${WORKFLOW_HEADER_COLOR}, 0 1px 10px rgba(0,0,0,0.5)`
          : isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": WORKFLOW_HEADER_COLOR
      }}
    >
      {selected && <Toolbar id={id} selected={selected} dragging={dragging} />}
      <NodeResizeHandle minWidth={150} minHeight={150} />
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={WORKFLOW_HEADER_COLOR}
        metadataTitle={headerTitle}
        hasParent={hasParent}
        iconType="workflow"
        iconBaseColor={WORKFLOW_HEADER_COLOR}
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
        fullWidth
        sx={{
          flex: "1 1 auto",
          minHeight: 120
        }}
      >
        <WorkflowNodeContent
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

export default memo(WorkflowNode);
