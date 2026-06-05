import React, { memo, useMemo } from "react";
import { Node, NodeProps, NodeToolbar, Position } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { FlexColumn, Box } from "../../ui_primitives";
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
import { DynamicComfySchemaContent } from "./DynamicComfySchemaContent";
import { ComfyWorkflowLoader } from "./ComfyWorkflowLoader";

const TOOLBAR_SHOW_DELAY = 200;

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

/** ComfyUI node accent. */
const COMFY_HEADER_COLOR = "#1F9E89";

/**
 * Dedicated React Flow node for lib.comfy.RunWorkflow. Provides workflow
 * loading (paste / drop) and renders typed inputs/outputs derived from the
 * loaded ComfyUI workflow.
 */
const DynamicComfySchemaNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = props;
  const { workflow_id } = data;
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const hasParent = Boolean(parentId);

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const statusRaw = useNodeStatus(workflow_id, id);
  const statusValue =
    statusRaw && typeof statusRaw !== "object" ? statusRaw : undefined;

  const nodeType = useMemo(
    () => ({
      isConstantNode: type.startsWith("nodetool.constant"),
      isOutputNode: false
    }),
    [type]
  );

  if (!metadata) {
    return null;
  }

  return (
    <FlexColumn
      className="dynamic-comfy-schema-node"
      fullHeight
      sx={{
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${COMFY_HEADER_COLOR}40`,
        borderRadius: "var(--rounded-node)",
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${COMFY_HEADER_COLOR}, 0 1px 10px rgba(0,0,0,0.5)`
          : isFocused
            ? `0 0 0 2px ${theme.vars.palette.warning.main}`
            : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": COMFY_HEADER_COLOR
      }}
    >
      {selected && <Toolbar id={id} selected={selected} dragging={dragging} />}
      <NodeResizeHandle minWidth={180} minHeight={150} />
      <Box sx={{ position: "relative" }}>
        <NodeHeader
          id={id}
          selected={selected}
          data={data}
          backgroundColor={COMFY_HEADER_COLOR}
          metadataTitle={metadata.title || "Run ComfyUI Workflow"}
          hasParent={hasParent}
          iconType={metadata?.outputs?.[0]?.type?.type}
          iconBaseColor={COMFY_HEADER_COLOR}
          workflowId={workflow_id}
          showResultButton={false}
          showInputsButton={false}
        />
        <Box
          sx={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)"
          }}
        >
          <ComfyWorkflowLoader nodeId={id} data={data} />
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
        sx={{ flex: "1 1 auto", minHeight: 120 }}
      >
        <DynamicComfySchemaContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          isConstantNode={nodeType.isConstantNode}
          isOutputNode={nodeType.isOutputNode}
          data={data}
          status={statusValue}
          workflowId={workflow_id}
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(DynamicComfySchemaNode);
