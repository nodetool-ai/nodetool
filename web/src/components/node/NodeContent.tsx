import React, { memo } from "react";
import { Button, Box } from "@mui/material";
import { Visibility } from "@mui/icons-material";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import isEqual from "lodash/isEqual";
import NodeProgress from "./NodeProgress";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import NodePropertyForm from "./NodePropertyForm";
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
  showResultOverlay,
  result,
  onShowInputs,
  onShowResults
}) => {
  const { handleAddProperty } = useDynamicProperty(
    id,
    data.dynamic_properties as Record<string, any>
  );

  const isEmptyObject = (obj: any) => {
   return obj && typeof obj === "object" && Object.keys(obj).length === 0;
};

  console.log("NodeContent render:", {
    id,
    nodeType,
    isOutputNode,
    result,
    resultType: typeof result,
    status,
    showResultOverlay
  });

  // For output nodes, always show overlay when result is available
  const shouldShowOverlay = isOutputNode 
    ? (result && !isEmptyObject(result))
    : (showResultOverlay && result && !isEmptyObject(result));

  if (shouldShowOverlay) {
    return (
      <>
        {/* Keep inputs and outputs in DOM for handles but hide visually */}
        <Box sx={{ visibility: "hidden", position: "absolute", pointerEvents: "none" }}>
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
          {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
        </Box>
        <ResultOverlay result={result} onShowInputs={isOutputNode ? undefined : onShowInputs} />
      </>
    );
  }

  // Determine what to show when overlay is not active
  const shouldShowResultButton =
    result &&
    !isEmptyObject(result) &&
    onShowResults &&
    status === "completed" &&
    !isConstantNode;

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
      {/* Show "Show Result" button when result is available and node is completed */}
      {shouldShowResultButton && (
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
      )}
      <ProcessTimer status={status} />
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </>
  );
};

export default memo(NodeContent, isEqual);
