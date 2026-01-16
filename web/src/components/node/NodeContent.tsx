import React, { memo } from "react";
import { Box } from "@mui/material";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
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
  onShowInputs
  // onShowResults is no longer used here but kept in interface for backwards compatibility
}) => {
  const { handleAddProperty } = useDynamicProperty(
    id,
    data.dynamic_properties as Record<string, any>
  );

  const isEmptyObject = (obj: any) => {
    return obj && typeof obj === "object" && Object.keys(obj).length === 0;
  };

  // For output nodes, always show overlay when result is available
  const shouldShowOverlay = isOutputNode
    ? result && !isEmptyObject(result)
    : showResultOverlay && result && !isEmptyObject(result);

  if (shouldShowOverlay) {
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
        {/* Keep inputs and outputs in DOM for handles and to set size, but hide most content visually */}
        <Box
          sx={{
            visibility: "hidden",
            pointerEvents: "none",
            // Keep handles visible and interactive
            "& .react-flow__handle": {
              visibility: "visible",
              pointerEvents: "auto",
              zIndex: 2
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
          {!isOutputNode && (
            <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
          )}
        </Box>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "auto",
            // Keep handles clickable even when overlay is on top
            "& .react-flow__handle": {
              pointerEvents: "none"
            }
          }}
        >
          <ResultOverlay
            result={result}
            onShowInputs={isOutputNode ? undefined : onShowInputs}
          />
        </Box>
      </Box>
    );
  }

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
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </Box>
  );
};

export default memo(NodeContent, isEqual);
