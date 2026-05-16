import React, { memo } from "react";
import { FlexColumn } from "../ui_primitives";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import NodeProgress from "./NodeProgress";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import NodePropertyForm from "./NodePropertyForm";
import { isContentCardNode } from "../node_types/contentCardRegistry";
import ContentCardBody from "../node_types/ContentCardBody";
import HandleColumn from "./HandleColumn";
import { isSnippetCodeNode } from "./codeNodeUi";
import { resolveExposedInputNames } from "../../utils/exposedInputs";

interface NodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isOutputNode: boolean;
  data: NodeData;
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
    prevProps.status !== nextProps.status ||
    prevProps.workflowId !== nextProps.workflowId ||
    prevProps.showResultOverlay !== nextProps.showResultOverlay
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

  // The primary-output type drives body routing (isContentCardNode) and
  // ContentCardBody variant. Two metadata objects with the same output count
  // but different primary-output types must re-render.
  const prevPrimary = prevProps.nodeMetadata.outputs?.[0];
  const nextPrimary = nextProps.nodeMetadata.outputs?.[0];
  const prevPrimaryType =
    (prevPrimary?.type as { type?: string } | undefined)?.type ?? "";
  const nextPrimaryType =
    (nextPrimary?.type as { type?: string } | undefined)?.type ?? "";
  if (prevPrimaryType !== nextPrimaryType) {
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

  // Compare exposedInputs (affects which props render as handles)
  const prevExposed = prevProps.data.exposedInputs || [];
  const nextExposed = nextProps.data.exposedInputs || [];
  if (prevExposed.length !== nextExposed.length) {
    return false;
  }
  for (let i = 0; i < prevExposed.length; i++) {
    if (prevExposed[i] !== nextExposed[i]) {
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

  // Body routing (plan §4.1):
  //   bespoke registry (Track E — future)
  //     → content-card registry  (PR 4+)
  //       → generic body (this component's default layout)
  // Utility nodes (control flow, constants, etc.) intentionally never appear
  // in CONTENT_CARD_REGISTRY and stay on the generic body forever.
  if (isContentCardNode(nodeMetadata)) {
    return (
      <ContentCardBody
        id={id}
        nodeType={nodeType}
        nodeMetadata={nodeMetadata}
        data={data}
        workflowId={workflowId}
        status={status}
        isOutputNode={isOutputNode}
      />
    );
  }

  // Split properties by classification:
  //   inline_fields → full PropertyField rows (handle + label + editor)
  //   input_fields  → handle-only (rendered in HandleColumn on the left edge)
  //   default       → Inspector only (hidden in node body)
  // Code nodes in snippet mode hide their `code` property from the inline
  // list — the snippet editor itself replaces that editor surface.
  let inlineFieldNames = nodeMetadata.inline_fields ?? [];
  if (isSnippetCodeNode(nodeType, data)) {
    inlineFieldNames = inlineFieldNames.filter((n) => n !== "code");
  }
  // Input fields = metadata input_fields ∪ user-promoted exposedInputs.
  const inputFieldNames = resolveExposedInputNames(nodeMetadata, data);
  const allProperties = nodeMetadata.properties ?? [];
  const inlineProperties = allProperties.filter((p) =>
    inlineFieldNames.includes(p.name)
  );
  const inputProperties = allProperties.filter((p) =>
    inputFieldNames.includes(p.name)
  );

  return (
    <FlexColumn
      fullWidth
      fullHeight
      sx={{
        position: "relative",
        minHeight: 0
      }}
    >
      <HandleColumn id={id} properties={inputProperties} />
      <NodeInputs
        id={id}
        nodeMetadata={nodeMetadata}
        layout={nodeMetadata.layout}
        properties={inlineProperties}
        nodeType={nodeType}
        data={data}
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
