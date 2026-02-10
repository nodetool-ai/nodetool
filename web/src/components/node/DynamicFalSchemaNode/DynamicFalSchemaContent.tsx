import React, { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import { FalSchemaLoader } from "./FalSchemaLoader";
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onShowInputs
}) => {
  const containerSx = useMemo(
    () => ({
      position: "relative" as const,
      width: "100%",
      height: "100%",
      minHeight: 0,
      display: "flex" as const,
      flexDirection: "column" as const
    }),
    []
  );

  const inputsBoxSx = useMemo(
    () => ({
      flex: "1 1 auto",
      minHeight: 80,
      overflow: "visible" as const,
      display: "flex" as const,
      flexDirection: "column" as const,
      // Force properties, labels, handles and input controls visible (override zoom/other CSS)
      visibility: "visible" as const,
      "& .node-inputs": {
        visibility: "visible"
      },
      "& .node-property": {
        visibility: "visible",
        opacity: 1
      },
      "& .node-property *": {
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
      },
      "& .node-property .property-input-container": {
        visibility: "visible",
        opacity: 1
      },
      // Hide edit/delete action icons for FAL dynamic inputs
      "& .action-icons": {
        display: "none"
      }
    }),
    []
  );

  const footerBoxSx = useMemo(
    () => ({
      flexShrink: 0,
      mt: 0.5,
      px: 1,
      py: 0.25,
      borderTop: 1,
      borderColor: "divider"
    }),
    []
  );

  return (
    <Box sx={containerSx}>
      <FalSchemaLoader nodeId={id} data={data} />
      <Box className="dynamic-fal-schema-inputs" sx={inputsBoxSx}>
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
      <Box sx={footerBoxSx}>
        <Typography variant="caption" color="text.secondary">
          fal.ai
          {data.endpoint_id && <> · {data.endpoint_id}</>}
        </Typography>
      </Box>
    </Box>
  );
};

export default React.memo(DynamicFalSchemaContent);
