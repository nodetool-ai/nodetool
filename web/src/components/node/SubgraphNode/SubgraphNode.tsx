import React, { memo, useCallback, useMemo } from "react";
import { Node, NodeProps, NodeToolbar, Position } from "@xyflow/react";
import { Box } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
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
import { useSubgraphTabsStore } from "../../../stores/SubgraphTabsStore";
import { SubgraphNodeContent } from "./SubgraphNodeContent";

const TOOLBAR_SHOW_DELAY = 200;

/** Accent color for SubgraphNode (violet — distinct from WorkflowNode's teal). */
const SUBGRAPH_HEADER_COLOR = "#7C3AED";

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

  const openSubgraphTab = useSubgraphTabsStore((state) => state.openTab);
  const handleDoubleClick = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      const innerGraph = (data.properties?.graph as
        | { nodes?: unknown[]; edges?: unknown[] }
        | undefined) ?? { nodes: [], edges: [] };
      openSubgraphTab({
        workflowId: workflow_id,
        nodeId: id,
        label: headerTitle,
        initialGraph: {
          nodes: Array.isArray(innerGraph.nodes) ? innerGraph.nodes : [],
          edges: Array.isArray(innerGraph.edges) ? innerGraph.edges : []
        }
      });
    },
    [openSubgraphTab, workflow_id, id, headerTitle, data.properties?.graph]
  );

  if (!metadata) {
    return null;
  }

  return (
    <Box
      className="subgraph-node"
      onDoubleClick={handleDoubleClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${SUBGRAPH_HEADER_COLOR}40`,
        borderRadius: theme.rounded.node,
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${SUBGRAPH_HEADER_COLOR}, 0 1px 10px rgba(0,0,0,0.5)`
          : isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": SUBGRAPH_HEADER_COLOR
      }}
    >
      {selected && <Toolbar id={id} selected={selected} dragging={dragging} />}
      <NodeResizeHandle minWidth={150} minHeight={150} />
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={SUBGRAPH_HEADER_COLOR}
        metadataTitle={headerTitle}
        hasParent={hasParent}
        iconType="workflow"
        iconBaseColor={SUBGRAPH_HEADER_COLOR}
        workflowId={workflow_id}
      />
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
          minHeight: 80,
          width: "100%",
          display: "flex",
          flexDirection: "column"
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
      </Box>
    </Box>
  );
};

export default memo(SubgraphNode);
