import React, { memo } from "react";
import { Typography, Button, Box } from "@mui/material";
import { Visibility } from "@mui/icons-material";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeLogs } from "./NodeLogs";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import isEqual from "lodash/isEqual";
import NodeProgress from "./NodeProgress";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import NodePropertyForm from "./NodePropertyForm";
import useLogsStore from "../../stores/LogStore";
import ResultOverlay from "./ResultOverlay";

interface NodeContentProps {
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
  status: string;
  workflowId: string;
  renderedResult: React.ReactNode;
  showResultOverlay: boolean;
  result: any;
  onShowInputs: () => void;
  onShowResults?: () => void;
}

const NodeContent: React.FC<NodeContentProps> = ({
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
  renderedResult,
  showResultOverlay,
  result,
  onShowInputs,
  onShowResults
}) => {
  const { handleAddProperty } = useDynamicProperty(
    id,
    data.dynamic_properties as Record<string, any>
  );

  const logs = useLogsStore((state) => state.getLogs(workflowId, id));
  
  // If overlay is enabled and we have a result, show overlay
  if (showResultOverlay && result) {
    return (
      <>
        <ResultOverlay result={result} onShowInputs={onShowInputs} />
        <ProcessTimer status={status} />
        {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
        <NodeLogs id={id} workflowId={workflowId} />
      </>
    );
  }
  
  return (
    <>
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
      {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
      {/* Show "Show Result" button when result is available, overlay is hidden, and node is completed */}
      {(() => {
        const shouldShowResultButton =
          result &&
          !showResultOverlay &&
          onShowResults &&
          status === "completed";

        if (shouldShowResultButton) {
          return (
            <Box sx={{ padding: 1, textAlign: "center" }}>
              <Button
                size="small"
                startIcon={<Visibility />}
                onClick={onShowResults}
                variant="outlined"
                sx={{ textTransform: "none" }}
              >
                Show Result
              </Button>
            </Box>
          );
        }
        return null;
      })()}
      {/* Show inline result only when overlay is hidden and node is not completed with a result */}
      {(() => {
        const shouldShowInlineResult =
          !showResultOverlay && !(result && status === "completed");
        return shouldShowInlineResult ? renderedResult : null;
      })()}
      <ProcessTimer status={status} />
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
      <NodeLogs id={id} workflowId={workflowId} />
    </>
  );
};

export default memo(NodeContent, isEqual);
