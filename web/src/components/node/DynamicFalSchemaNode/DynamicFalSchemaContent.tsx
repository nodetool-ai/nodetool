import React, { memo } from "react";
import { Box } from "@mui/material";
import { Text, Caption, FlexColumn } from "../../ui_primitives";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
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
  showResultOverlay?: boolean;
  result?: unknown;
  onShowInputs?: () => void;
  onShowResults?: () => void;
}

/**
 * Custom content for the FalAI node.
 * Keeps all FAL-specific UI in one place: Load schema, inputs/outputs,
 * and space for future FAL extras (credits, docs link, etc.).
 */
export const DynamicFalSchemaContent: React.FC<DynamicFalSchemaContentProps> =
  memo(
    ({
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
      workflowId
    }) => {
      const hasModel =
        data.dynamic_inputs && Object.keys(data.dynamic_inputs).length > 0;

      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{
            position: "relative",
            minHeight: 0
          }}
        >
          {!hasModel && (
            <Box sx={{ px: 1.5, py: 1, opacity: 0.7 }}>
              <Text size="small" color="secondary">
                Run any model on fal.ai.
              </Text>
              <Caption
                component="p"
              >
                Paste the llms.txt from a fal.ai model page into the model_info
                field.
              </Caption>
            </Box>
          )}
          <Box
            className="dynamic-fal-schema-inputs"
            sx={{
              flex: "1 1 auto",
              minHeight: 80,
              overflow: "visible",
              display: "flex",
              flexDirection: "column",
              // Force properties, labels, handles and input controls visible (override zoom/other CSS)
              visibility: "visible",
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
          {status === "running" && (
            <NodeProgress id={id} workflowId={workflowId} />
          )}
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
            <Caption>
              fal.ai
              {data.endpoint_id && <> · {data.endpoint_id}</>}
            </Caption>
          </Box>
        </FlexColumn>
      );
    }
  );

DynamicFalSchemaContent.displayName = "DynamicFalSchemaContent";
