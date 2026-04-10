import React, { memo } from "react";
import { Box } from "@mui/material";
import { Text, Caption, FlexColumn } from "../../ui_primitives";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

export interface DynamicKieSchemaContentProps {
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

export const DynamicKieSchemaContent: React.FC<DynamicKieSchemaContentProps> =
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
                Run any model on kie.ai.
              </Text>
              <Caption
                component="p"
              >
                Paste the API documentation from a kie.ai model page into the
                model_info field.
              </Caption>
            </Box>
          )}
          <Box
            className="dynamic-kie-schema-inputs"
            sx={{
              flex: "1 1 auto",
              minHeight: 80,
              overflow: "visible",
              display: "flex",
              flexDirection: "column",
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
              kie.ai
              {data.model_id && <> &middot; {data.model_id}</>}
            </Caption>
          </Box>
        </FlexColumn>
      );
    }
  );

DynamicKieSchemaContent.displayName = "DynamicKieSchemaContent";
