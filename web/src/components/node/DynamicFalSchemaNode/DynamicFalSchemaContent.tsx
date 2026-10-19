import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { Text, Caption, FlexColumn, Box } from "../../ui_primitives";
import { NodeInputs } from "../NodeInputs";
import { NodeOutputs } from "../NodeOutputs";
import NodeProgress from "../NodeProgress";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

interface DynamicFalSchemaContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: NodeData;
  status?: string;
  workflowId: string;
  result?: unknown;
}

export const DynamicFalSchemaContent: React.FC<DynamicFalSchemaContentProps> =
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
      const { t } = useTranslation();
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
                {t("i18n-next78.nodeEditor.dynamicSchema.fal.description")}
              </Text>
              <Caption component="p">
                {t("i18n-next78.nodeEditor.dynamicSchema.fal.instructions")}
              </Caption>
            </Box>
          )}
          <FlexColumn
            className="dynamic-fal-schema-inputs"
            sx={{
              flex: "1 1 auto",
              minHeight: 80,
              overflow: "visible",
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
            />
          </FlexColumn>
          {!isOutputNode && (
            <Box sx={{ flexShrink: 0 }}>
              <NodeOutputs
                id={id}
                outputs={nodeMetadata.outputs}
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
              py: 0.5,
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
