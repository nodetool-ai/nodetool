import React, { memo } from "react";
import { Text, Caption, FlexColumn, Box } from "../../ui_primitives";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

const EMPTY_PROPERTIES: Property[] = [];

export interface DynamicComfySchemaContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: NodeData;
  status?: string;
  workflowId: string;
}

/**
 * Custom content for the Run ComfyUI Workflow node: typed inputs/outputs
 * derived from the loaded workflow, plus a hint when no workflow is loaded yet.
 */
export const DynamicComfySchemaContent: React.FC<DynamicComfySchemaContentProps> =
  memo(
    ({
      id,
      nodeType,
      nodeMetadata,
      isConstantNode,
      isOutputNode,
      data,
      status,
      workflowId
    }) => {
      const hasWorkflow =
        !!data.dynamic_inputs &&
        Object.keys(data.dynamic_inputs).length > 0;
      const hasOutputs =
        !!data.dynamic_outputs &&
        Object.keys(data.dynamic_outputs).length > 0;

      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ position: "relative", minHeight: 0 }}
        >
          {!hasWorkflow && !hasOutputs && (
            <Box sx={{ px: 1.5, py: 1, opacity: 0.7 }}>
              <Text size="small" color="secondary">
                Run a ComfyUI workflow on any ComfyUI server.
              </Text>
              <Caption component="p">
                Click the upload icon to load a workflow (paste API JSON or drop
                a .json/.png).
              </Caption>
            </Box>
          )}
          <FlexColumn
            className="dynamic-comfy-schema-inputs"
            sx={{
              flex: "1 1 auto",
              minHeight: 80,
              overflow: "visible",
              visibility: "visible",
              "& .node-property": { visibility: "visible", opacity: 1 },
              "& .node-property *": { visibility: "visible", opacity: 1 },
              "& .node-property .react-flow__handle": {
                visibility: "visible",
                opacity: 1
              },
              "& .action-icons": { display: "none" }
            }}
          >
            {/* Static props (workflow, endpoint, timeout) are managed via the
                loader and Inspector — not shown inline or as input handles.
                Only the workflow-derived dynamic inputs render here. */}
            <NodeInputs
              id={id}
              nodeMetadata={nodeMetadata}
              layout={nodeMetadata.layout}
              properties={EMPTY_PROPERTIES}
              nodeType={nodeType}
              data={data}
              showHandle={!isConstantNode}
            />
          </FlexColumn>
          {!isOutputNode && (
            <Box sx={{ flexShrink: 0 }}>
              <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
            </Box>
          )}
          {status === "running" && (
            <NodeProgress id={id} workflowId={workflowId} />
          )}
        </FlexColumn>
      );
    }
  );

DynamicComfySchemaContent.displayName = "DynamicComfySchemaContent";
