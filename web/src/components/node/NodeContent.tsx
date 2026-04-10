import React, { memo } from "react";
import { FlexColumn } from "../ui_primitives";
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

  // Check data.properties - compare both keys and values
  const prevDataProps = prevProps.data.properties || {};
  const nextDataProps = nextProps.data.properties || {};
  const prevDataKeys = Object.keys(prevDataProps);
  const nextDataKeys = Object.keys(nextDataProps);
  if (prevDataKeys.length !== nextDataKeys.length) {
    return false;
  }
  for (const key of prevDataKeys) {
    if (prevDataProps[key] !== nextDataProps[key]) {
      return false;
    }
  }

  // Check data.dynamic_properties - compare both keys and values
  const prevDynProps = prevProps.data.dynamic_properties || {};
  const nextDynProps = nextProps.data.dynamic_properties || {};
  const prevDynKeys = Object.keys(prevDynProps);
  const nextDynKeys = Object.keys(nextDynProps);
  if (prevDynKeys.length !== nextDynKeys.length) {
    return false;
  }
  for (const key of prevDynKeys) {
    if (prevDynProps[key] !== nextDynProps[key]) {
      return false;
    }
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
    prevProps.onShowInputs !== nextProps.onShowInputs ||
    prevProps.onShowResults !== nextProps.onShowResults
  ) {
    return false;
  }

  return true;
};

const NodeContent: React.FC<NodeContentProps> = ({
  id,
  nodeType,
  nodeMetadata,
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
    ? Boolean(result && !isEmptyObject(result))
    : Boolean(showResultOverlay && result && !isEmptyObject(result));

  return (
    <FlexColumn
      fullWidth
      fullHeight
      sx={{
        position: "relative",
        minHeight: 0
      }}
    >
      {/* Result panel — positioned above the node */}
      {shouldShowOverlay && (
        <FlexColumn
          className="result-panel-above"
          fullWidth
          sx={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            maxHeight: 300,
            overflow: "hidden",
            borderRadius: "8px 8px 0 0",
            backgroundColor: "var(--palette-grey-900)",
            borderBottom: "1px solid var(--palette-grey-800)",
            zIndex: 5,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.3)"
          }}
        >
          <ResultOverlay
            result={result}
            nodeId={id}
            workflowId={workflowId}
            nodeName={nodeMetadata.title}
            onShowInputs={isOutputNode ? undefined : onShowInputs}
          />
        </FlexColumn>
      )}

      {/* Always render inputs/outputs normally */}
      <NodeInputs
        id={id}
        nodeMetadata={nodeMetadata}
        layout={nodeMetadata.layout}
        properties={nodeMetadata.properties}
        nodeType={nodeType}
        data={data}
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
    </FlexColumn>
  );
};

export { arePropsEqual };
export default memo(NodeContent, arePropsEqual);
