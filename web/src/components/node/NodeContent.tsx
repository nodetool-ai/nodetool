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

  // Results from the store are always a new reference when they change,
  // so reference equality is both correct and avoids O(n) key enumeration.
  if (prevProps.result !== nextProps.result) {
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
    data.dynamic_properties
  );

  const isEmptyObject = (obj: unknown): boolean => {
    return !!obj && typeof obj === "object" && Object.keys(obj).length === 0;
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
