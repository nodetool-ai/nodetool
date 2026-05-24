import React, { memo, useMemo } from "react";
import { Box } from "@mui/material";
import { Caption } from "../../ui_primitives";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import NodePropertyForm from "../NodePropertyForm";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";
import { SubgraphSync } from "./SubgraphSync";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

export interface SubgraphNodeContentProps {
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
      data.dynamic_properties as Record<string, unknown>
    );

    const innerGraph = data.properties?.graph as
      | { nodes?: unknown[]; edges?: unknown[] }
      | undefined;
    const innerNodeCount = Array.isArray(innerGraph?.nodes)
      ? innerGraph.nodes.length
      : 0;

    const visibleProperties = useMemo(
      () => nodeMetadata.properties.filter((p) => p.name !== "graph"),
      [nodeMetadata.properties]
    );

    return (
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          paddingTop: 1
        }}
      >
        <SubgraphSync nodeId={id} data={data} />
        <Box
          className="subgraph-node-inputs"
          sx={{
            flex: "1 1 auto",
            minHeight: 40,
            overflow: "visible",
            display: "flex",
            flexDirection: "column"
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
            editableDynamicInputs={false}
          />
        </Box>
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
          sx={{
            flexShrink: 0,
            mt: 0.5,
            px: 1,
            py: 0.25,
            borderTop: 1,
            borderColor: "divider"
          }}
        >
          <Caption>
            {innerNodeCount === 0
              ? "empty — double-click to edit"
              : `${innerNodeCount} inner node${innerNodeCount === 1 ? "" : "s"}`}
          </Caption>
        </Box>
      </Box>
    );
  }
);

SubgraphNodeContent.displayName = "SubgraphNodeContent";
