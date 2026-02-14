import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import NodePropertyForm from "../NodePropertyForm";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";
import { WorkflowLoader } from "./WorkflowLoader";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

export interface WorkflowNodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  basicFields: string[];
  showAdvancedFields: boolean;
  hasAdvancedFields: boolean;
  onToggleAdvancedFields: () => void;
  status?: string;
  workflowId: string;
}

/**
 * Custom content for the WorkflowNode.
 * Shows a workflow selector plus dynamic inputs/outputs derived from
 * the selected workflow's input and output nodes.
 */
export const WorkflowNodeContent: React.FC<WorkflowNodeContentProps> = memo(
  ({
    id,
    nodeType,
    nodeMetadata,
    data,
    basicFields,
    showAdvancedFields,
    hasAdvancedFields,
    onToggleAdvancedFields,
    status,
    workflowId
  }) => {
    const { handleAddProperty } = useDynamicProperty(
      id,
      data.dynamic_properties as Record<string, unknown>
    );

    const workflowName = (
      data.properties?.workflow_json as Record<string, unknown> | undefined
    )?.name as string | undefined;

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
        <WorkflowLoader nodeId={id} data={data} />
        <Box
          className="workflow-node-inputs"
          sx={{
            flex: "1 1 auto",
            minHeight: 40,
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
            showHandle={true}
            hasAdvancedFields={hasAdvancedFields}
            showAdvancedFields={showAdvancedFields}
            basicFields={basicFields}
            onToggleAdvancedFields={onToggleAdvancedFields}
          />
        </Box>
        {(nodeMetadata.is_dynamic ||
          nodeMetadata.supports_dynamic_outputs) && (
          <NodePropertyForm
            id={id}
            isDynamic={nodeMetadata.is_dynamic}
            supportsDynamicOutputs={nodeMetadata.supports_dynamic_outputs}
            dynamicOutputs={data.dynamic_outputs || {}}
            onAddProperty={handleAddProperty}
            nodeType={nodeType}
          />
        )}
        <Box sx={{ flexShrink: 0 }}>
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
          />
        </Box>
        {status === "running" && (
          <NodeProgress id={id} workflowId={workflowId} />
        )}
        {/* Workflow info footer */}
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
            Sub-Workflow
            {workflowName && <> · {workflowName}</>}
          </Typography>
        </Box>
      </Box>
    );
  }
);

WorkflowNodeContent.displayName = "WorkflowNodeContent";
