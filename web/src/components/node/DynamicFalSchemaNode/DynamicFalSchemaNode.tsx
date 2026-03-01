import React, { memo, useCallback, useMemo, useState } from "react";
import { Node, NodeProps, NodeToolbar, Position } from "@xyflow/react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { NodeData } from "../../../stores/NodeData";
import { NodeHeader } from "../NodeHeader";
import { NodeErrors } from "../NodeErrors";
import NodeStatus from "../NodeStatus";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeToolButtons from "../NodeToolButtons";
import NodeExecutionTime from "../NodeExecutionTime";
import useMetadataStore from "../../../stores/MetadataStore";
import useStatusStore from "../../../stores/StatusStore";
import useResultsStore from "../../../stores/ResultsStore";
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
 * Dedicated React Flow node for fal.dynamic_schema.FalAI.
 * Full control over layout, styling, and future FAL-specific UI (credits, docs).
 */
const DynamicFalSchemaNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = props;
  const { workflow_id } = data;
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const updateNode = useNodes((state) => state.updateNode);
  const hasParent = Boolean(parentId);

  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const status = useStatusStore((state) => state.getStatus(workflow_id, id));
  const statusValue =
    status && status !== null && typeof status !== "object"
      ? status
      : undefined;
  const result = useResultsStore(
    (state) =>
      state.getOutputResult(workflow_id, id) ?? state.getResult(workflow_id, id)
  );

  const meta = useMemo(
    () => {
        if (!metadata) {return { nodeBasicFields: [], hasAdvancedFields: false };}
        return {
            nodeBasicFields: metadata.basic_fields || [],
            hasAdvancedFields:
                (metadata.properties?.length ?? 0) >
                (metadata.basic_fields?.length ?? 0)
        };
    },
    [metadata]
  );

  const onToggleAdvancedFields = useCallback(() => {
    setShowAdvancedFields((prev) => !prev);
    updateNode(id, { height: undefined, measured: undefined });
  }, [id, updateNode]);

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
    <Box
      className="dynamic-fal-schema-node"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
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
          onShowResults={() => {}}
          onShowInputs={() => {}}
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
      <Box
        className="node-content-container"
        sx={{
          flex: "1 1 auto",
          minHeight: 120,
          width: "100%",
          overflow: "visible",
          display: "flex",
          flexDirection: "column",
          clipPath: "inset(0 -20px)"
        }}
      >
        <DynamicFalSchemaContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          isConstantNode={nodeType.isConstantNode}
          isOutputNode={nodeType.isOutputNode}
          data={data}
          basicFields={meta.nodeBasicFields}
          showAdvancedFields={showAdvancedFields}
          hasAdvancedFields={meta.hasAdvancedFields}
          onToggleAdvancedFields={onToggleAdvancedFields}
          status={statusValue}
          workflowId={workflow_id}
          showResultOverlay={false}
          result={result}
          onShowInputs={() => {}}
        />
      </Box>
    </Box>
  );
};

export default memo(DynamicFalSchemaNode);
