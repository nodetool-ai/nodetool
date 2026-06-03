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
import { useNodeStatus, useNodeResultValue } from "../../../hooks/nodes/useNodeExecState";
import { useNodes } from "../../../contexts/NodeContext";
import useSelect from "../../../hooks/nodes/useSelect";
import { useDelayedVisibility } from "../../../hooks/useDelayedVisibility";
import { useNodeFocusStore } from "../../../stores/NodeFocusStore";
import { DynamicFalSchemaContent } from "./DynamicFalSchemaContent";
import { FalSchemaLoader } from "./FalSchemaLoader";

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

/** FAL node accent (distinct from input/output/generic) */
const FAL_HEADER_COLOR = "#8B5CF6";

/**
 * Dedicated React Flow node for fal.DynamicFal.
 * Full control over layout, styling, and future FAL-specific UI (credits, docs).
 */
const DynamicFalSchemaNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = props;
  const { workflow_id } = data;
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const hasParent = Boolean(parentId);

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const statusRaw = useNodeStatus(workflow_id, id);
  const statusValue =
    statusRaw && statusRaw !== null && typeof statusRaw !== "object"
      ? statusRaw
      : undefined;
  const result = useNodeResultValue(workflow_id, id);

  const nodeType = useMemo(
    () => ({
      isConstantNode: type.startsWith("nodetool.constant"),
      isOutputNode: false
    }),
    [type]
  );

  const headerTitle = useMemo(() => {
    if (!metadata) {return "Fal AI";}
    const base = metadata.title || "Fal AI";
    const endpointId = data.endpoint_id?.replace("fal-ai/", "");
    return endpointId ? `${base} · ${endpointId}` : base;
  }, [metadata, data.endpoint_id]);

  if (!metadata) {
    return null;
  }

  return (
    <FlexColumn
      className="dynamic-fal-schema-node"
      fullHeight
      sx={{
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${FAL_HEADER_COLOR}40`,
        borderRadius: "var(--rounded-node)",
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${FAL_HEADER_COLOR}, 0 1px 10px rgba(0,0,0,0.5)`
          : isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": FAL_HEADER_COLOR
      }}
    >
      {selected && <Toolbar id={id} selected={selected} dragging={dragging} />}
      <NodeResizeHandle minWidth={150} minHeight={150} />
      <Box sx={{ position: "relative" }}>
        <NodeHeader
          id={id}
          selected={selected}
          data={data}
          backgroundColor={FAL_HEADER_COLOR}
          metadataTitle={headerTitle}
          hasParent={hasParent}
          iconType={metadata?.outputs?.[0]?.type?.type}
          iconBaseColor={FAL_HEADER_COLOR}
          workflowId={workflow_id}
          showResultButton={false}
          showInputsButton={false}
          externalLink={data.endpoint_id ? `https://fal.ai/models/${data.endpoint_id}` : undefined}
          externalLinkTitle="View on fal.ai"
        />
        <Box sx={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>
          <FalSchemaLoader nodeId={id} data={data} />
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
        <DynamicFalSchemaContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          isConstantNode={nodeType.isConstantNode}
          isOutputNode={nodeType.isOutputNode}
          data={data}
          status={statusValue}
          workflowId={workflow_id}
          showResultOverlay={false}
          result={result}
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(DynamicFalSchemaNode);
