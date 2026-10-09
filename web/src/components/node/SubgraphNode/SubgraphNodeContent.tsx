import React, { memo, useCallback, useMemo } from "react";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { Box, Caption, FlexColumn, FlexRow, MOTION } from "../../ui_primitives";
import { useNodes } from "../../../contexts/NodeContext";
import { useOpenSubgraph } from "../../../hooks/nodes/useOpenSubgraph";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import NodePropertyForm from "../NodePropertyForm";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";
import { SubgraphSync } from "./SubgraphSync";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

interface SubgraphNodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  status?: string;
  workflowId: string;
}

export const SubgraphNodeContent: React.FC<SubgraphNodeContentProps> = memo(
  ({ id, nodeType, nodeMetadata, data, status, workflowId }) => {
    const { handleAddProperty } = useDynamicProperty(
      id,
      data.dynamic_properties
    );

    const innerGraph = data.properties?.graph as
      | { nodes?: unknown[]; edges?: unknown[] }
      | undefined;
    const innerNodeCount = Array.isArray(innerGraph?.nodes)
      ? innerGraph.nodes.length
      : 0;

    // The canvas this node sits on, not `data.workflow_id` — that is only
    // stamped on nodes the store created, so a node loaded from a saved graph
    // would key its tab off "" and the tab strip would never find it.
    const canvasWorkflowId = useNodes((state) => state.workflow.id);
    const openSubgraph = useOpenSubgraph();
    const handleOpen = useCallback(() => {
      openSubgraph(canvasWorkflowId, id, data);
    }, [openSubgraph, canvasWorkflowId, id, data]);

    const visibleProperties = useMemo(
      () => nodeMetadata.properties.filter((p) => p.name !== "graph"),
      [nodeMetadata.properties]
    );

    return (
      <FlexColumn
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 0,
          paddingTop: 1
        }}
      >
        <SubgraphSync nodeId={id} data={data} />
        <FlexColumn
          className="subgraph-node-inputs"
          sx={{
            flex: "1 1 auto",
            minHeight: 40,
            overflow: "visible"
          }}
        >
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={visibleProperties}
            nodeType={nodeType}
            data={data}
            showHandle={true}
            editableDynamicInputs={true}
          />
        </FlexColumn>
        {nodeMetadata.supports_dynamic_outputs && (
          <NodePropertyForm
            id={id}
            isDynamic={false}
            supportsDynamicOutputs={nodeMetadata.supports_dynamic_outputs}
            dynamicOutputs={data.dynamic_outputs || {}}
            onAddProperty={handleAddProperty}
            nodeType={nodeType}
          />
        )}
        <Box sx={{ flexShrink: 0 }}>
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </Box>
        {status === "running" && (
          <NodeProgress id={id} workflowId={workflowId} />
        )}
        <Box
          component="button"
          type="button"
          className="nodrag nopan"
          onClick={handleOpen}
          title="Open the subgraph in its own tab"
          sx={{
            flexShrink: 0,
            mt: 0.5,
            pl: 1,
            // Extra right inset keeps the count clear of the resize handle.
            pr: 4,
            py: 0.5,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            borderTop: 1,
            borderLeft: 0,
            borderRight: 0,
            borderBottom: 0,
            borderStyle: "solid",
            borderColor: "divider",
            background: "transparent",
            color: "text.secondary",
            cursor: "pointer",
            textAlign: "left",
            transition: MOTION.background,
            "&:hover": { backgroundColor: "action.hover" }
          }}
        >
          <FlexRow gap={0.5} align="center">
            <AccountTreeIcon sx={{ fontSize: 14 }} />
            <Caption>Open subgraph</Caption>
          </FlexRow>
          <Caption>
            {innerNodeCount === 0
              ? "empty"
              : `${innerNodeCount} inner node${innerNodeCount === 1 ? "" : "s"}`}
          </Caption>
        </Box>
      </FlexColumn>
    );
  }
);

SubgraphNodeContent.displayName = "SubgraphNodeContent";
