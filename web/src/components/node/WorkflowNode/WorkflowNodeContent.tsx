import React, { memo } from "react";
import { Caption, FlexColumn, Box } from "../../ui_primitives";
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
    status,
    workflowId
  }) => {
    const { handleAddProperty } = useDynamicProperty(
      id,
      data.dynamic_properties as Record<string, unknown>
    );

    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{
          position: "relative",
          minHeight: 0,
          paddingTop: 3,
        }}
      >
        <WorkflowLoader nodeId={id} data={data} />
        <FlexColumn
          className="workflow-node-inputs"
          sx={{
            flex: "1 1 auto",
            minHeight: 40,
            overflow: "visible",
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
            editableDynamicInputs={false}
          />
        </FlexColumn>
        {(nodeMetadata.supports_dynamic_inputs ||
          nodeMetadata.supports_dynamic_outputs) && (
            <NodePropertyForm
              id={id}
              isDynamic={nodeMetadata.supports_dynamic_inputs}
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
          />
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
            {/* {subWorkflow?.name && <> · {subWorkflow.name}</>} */}
          </Caption>
        </Box>
      </FlexColumn>
    );
  }
);

WorkflowNodeContent.displayName = "WorkflowNodeContent";
