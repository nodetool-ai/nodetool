import React, { memo } from "react";
import { Box } from "@mui/material";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
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
  status?: string;
  workflowId: string;
  showResultOverlay: boolean;
  result: any;
  onShowInputs: () => void;
  onShowResults?: () => void;
}

/**
 * Custom comparison function for NodeContent memo
 * Only compares props that actually affect rendering to avoid unnecessary re-renders
 */
const arePropsEqual = (
  prevProps: NodeContentProps,
  nextProps: NodeContentProps
): boolean => {
  // These props should always be the same reference
  if (
    prevProps.id !== nextProps.id ||
    prevProps.nodeType !== nextProps.nodeType ||
    prevProps.isConstantNode !== nextProps.isConstantNode ||
    prevProps.isOutputNode !== nextProps.isOutputNode ||
    prevProps.showAdvancedFields !== nextProps.showAdvancedFields ||
    prevProps.hasAdvancedFields !== nextProps.hasAdvancedFields ||
    prevProps.status !== nextProps.status ||
    prevProps.workflowId !== nextProps.workflowId ||
    prevProps.showResultOverlay !== nextProps.showResultOverlay ||
    prevProps.basicFields.length !== nextProps.basicFields.length ||
    !prevProps.basicFields.every((field, i) => field === nextProps.basicFields[i])
  ) {
    return false;
  }

  // Check nodeMetadata - only compare fields that affect rendering
  if (
    prevProps.nodeMetadata.title !== nextProps.nodeMetadata.title ||
    prevProps.nodeMetadata.layout !== nextProps.nodeMetadata.layout ||
    prevProps.nodeMetadata.is_dynamic !== nextProps.nodeMetadata.is_dynamic ||
    prevProps.nodeMetadata.supports_dynamic_outputs !==
      nextProps.nodeMetadata.supports_dynamic_outputs ||
    prevProps.nodeMetadata.is_streaming_output !==
      nextProps.nodeMetadata.is_streaming_output
  ) {
    return false;
  }

  // For properties and outputs, use shallow comparison on length
  // Deep comparison is too expensive for every render
  const prevPropsLen = prevProps.nodeMetadata.properties?.length ?? 0;
  const nextPropsLen = nextProps.nodeMetadata.properties?.length ?? 0;
  if (prevPropsLen !== nextPropsLen) {
    return false;
  }

  const prevOutputsLen = prevProps.nodeMetadata.outputs?.length ?? 0;
  const nextOutputsLen = nextProps.nodeMetadata.outputs?.length ?? 0;
  if (prevOutputsLen !== nextOutputsLen) {
    return false;
  }

  // Check data.properties - shallow comparison of keys is sufficient
  const prevDataKeys = Object.keys(prevProps.data.properties || {});
  const nextDataKeys = Object.keys(nextProps.data.properties || {});
  if (prevDataKeys.length !== nextDataKeys.length) {
    return false;
  }

  // Check dynamic_outputs
  const prevDynamicOutputsKeys = Object.keys(
    prevProps.data.dynamic_outputs || {}
  );
  const nextDynamicOutputsKeys = Object.keys(
    nextProps.data.dynamic_outputs || {}
  );
  if (prevDynamicOutputsKeys.length !== nextDynamicOutputsKeys.length) {
    return false;
  }

  // For result, we need a deeper check since it changes frequently
  // Use shallow comparison for objects, deep for primitives
  const prevResult = prevProps.result;
  const nextResult = nextProps.result;
  if (prevResult === nextResult) {
    // Same reference or both primitives are equal
    // Continue to check other props
  } else if (
    typeof prevResult === "object" &&
    typeof nextResult === "object" &&
    prevResult !== null &&
    nextResult !== null
  ) {
    // Both are objects - shallow check keys
    if (Object.keys(prevResult).length !== Object.keys(nextResult).length) {
      return false;
    }
  } else {
    // Different types or different primitive values
    return false;
  }

  // Functions should be stable references, but check them anyway
  if (
    prevProps.onToggleAdvancedFields !== nextProps.onToggleAdvancedFields ||
    prevProps.onShowInputs !== nextProps.onShowInputs
  ) {
    return false;
  }

  return true;
};

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
            <NodeOutputs
              id={id}
              outputs={nodeMetadata.outputs}
              isStreamingOutput={nodeMetadata.is_streaming_output}
            />
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
            nodeId={id}
            workflowId={workflowId}
            nodeName={nodeMetadata.title}
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
      {!isOutputNode && (
        <NodeOutputs
          id={id}
          outputs={nodeMetadata.outputs}
          isStreamingOutput={nodeMetadata.is_streaming_output}
        />
      )}
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </Box>
  );
};

export default memo(NodeContent, arePropsEqual);
