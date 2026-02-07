import React from "react";
import { Box, Typography } from "@mui/material";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";
import NodePropertyForm from "../NodePropertyForm";
import { FalSchemaLoader } from "../FalSchemaLoader";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

export interface DynamicFalSchemaContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: NodeData;
  basicFields: string[];
  showAdvancedFields: boolean;
  hasAdvancedFields: boolean;
  onToggleAdvancedFields: () => void;
  status?: string;
  workflowId: string;
  showResultOverlay: boolean;
  result: unknown;
  onShowInputs: () => void;
  onShowResults?: () => void;
}

/**
 * Custom content for the FAL Dynamic Schema node.
 * Keeps all FAL-specific UI in one place: Load schema, inputs/outputs,
 * and space for future FAL extras (credits, docs link, etc.).
 */
export const DynamicFalSchemaContent: React.FC<
  DynamicFalSchemaContentProps
> = ({
  id,
  nodeType,
  nodeMetadata,
  isConstantNode,
  isOutputNode,
  data,
  basicFields,
  showAdvancedFields,
  hasAdvancedFields,
  onToggleAdvancedFields,
  status,
  workflowId,
  onShowInputs
}) => {
  const { handleAddProperty } = useDynamicProperty(
    id,
    data.dynamic_properties as Record<string, unknown>
  );

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <FalSchemaLoader nodeId={id} data={data} />
      <NodeInputs
        id={id}
        nodeMetadata={nodeMetadata}
        layout={nodeMetadata.layout}
        properties={nodeMetadata.properties}
        nodeType={nodeType}
        data={data}
        showHandle={!isConstantNode}
        hasAdvancedFields={hasAdvancedFields}
        showAdvancedFields={showAdvancedFields}
        basicFields={basicFields}
        onToggleAdvancedFields={onToggleAdvancedFields}
      />
      {(nodeMetadata?.is_dynamic || nodeMetadata?.supports_dynamic_outputs) && (
        <NodePropertyForm
          id={id}
          isDynamic={nodeMetadata.is_dynamic}
          supportsDynamicOutputs={nodeMetadata.supports_dynamic_outputs}
          dynamicOutputs={data.dynamic_outputs || {}}
          onAddProperty={handleAddProperty}
          nodeType={nodeType}
        />
      )}
      {!isOutputNode && (
        <NodeOutputs
          id={id}
          outputs={nodeMetadata.outputs}
          isStreamingOutput={nodeMetadata.is_streaming_output}
        />
      )}
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
      {/* FAL-specific footer: credits, docs, etc. – extend here later */}
      <Box
        sx={{
          mt: 0.5,
          px: 1,
          py: 0.25,
          borderTop: 1,
          borderColor: "divider"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          fal.ai · Dynamic endpoint
        </Typography>
      </Box>
    </Box>
  );
};
