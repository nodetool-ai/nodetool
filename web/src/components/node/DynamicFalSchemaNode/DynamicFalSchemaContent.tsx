import React from "react";
import { Box, Typography } from "@mui/material";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
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
 * Custom content for the FalAI node.
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
      <Box
        className="dynamic-fal-schema-inputs"
        sx={{
          flex: "1 1 auto",
          minHeight: 80,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          paddingLeft: "24px",
          // Force properties, labels and handles visible (they can be hidden by zoom/other CSS)
          visibility: "visible",
          "& .node-inputs": {
            visibility: "visible"
          },
          "& .node-property": {
            visibility: "visible",
            opacity: 1
          },
          "& .node-property .react-flow__handle": {
            visibility: "visible",
            opacity: 1
          },
          "& .node-property .property-label": {
            visibility: "visible",
            opacity: 1
          },
          "& .node-property .property-label label": {
            visibility: "visible",
            opacity: 1,
            color: "var(--palette-text-secondary, inherit)"
          }
        }}
      >
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
      </Box>
      {!isOutputNode && (
        <Box sx={{ flexShrink: 0 }}>
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
          />
        </Box>
      )}
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
      {/* FAL-specific footer: credits, model name when loaded */}
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
        <Typography variant="caption" color="text.secondary">
          fal.ai
          {data.endpoint_id && <> · {data.endpoint_id}</>}
        </Typography>
      </Box>
    </Box>
  );
};
