import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

export interface DynamicReplicateContentProps {
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

export const DynamicReplicateContent: React.FC<DynamicReplicateContentProps> =
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
      workflowId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onShowInputs
    }) => {
      const hasModel =
        data.dynamic_inputs && Object.keys(data.dynamic_inputs).length > 0;

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
          {!hasModel && (
            <Box sx={{ px: 1.5, py: 1, opacity: 0.7 }}>
              <Typography variant="body2" color="text.secondary">
                Run any model on replicate.com.
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
              >
                Enter a Replicate model identifier (e.g. runwayml/gen-4.5) into
                the model_info field.
              </Typography>
            </Box>
          )}
          <Box
            className="dynamic-replicate-inputs"
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
            <Typography variant="caption" color="text.secondary">
              replicate
              {data.model_id && <> &middot; {data.model_id}</>}
            </Typography>
          </Box>
        </Box>
      );
    }
  );

DynamicReplicateContent.displayName = "DynamicReplicateContent";
