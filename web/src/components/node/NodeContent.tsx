import React, { memo, useMemo } from "react";
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
import { getBespokeBody } from "../node_types/editing/bespokeRegistry";
import HandleColumn from "./HandleColumn";
import { isSnippetCodeNode } from "./codeNodeUi";
import {
  resolveExposedInputNames,
  resolveInlineFieldNames
} from "../../utils/exposedInputs";
import ExposedLabeledInputs from "./ExposedLabeledInputs";

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

  // Compare exposed input placements (affects node-body handles / labeled rows)
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
  const prevLabeled = prevProps.data.exposedInputsLabeled || [];
  const nextLabeled = nextProps.data.exposedInputsLabeled || [];
  if (prevLabeled.length !== nextLabeled.length) {
    return false;
  }
  for (let i = 0; i < prevLabeled.length; i++) {
    if (prevLabeled[i] !== nextLabeled[i]) {
      return false;
    }
  }
  const prevHidden = prevProps.data.exposedInputsHidden || [];
  const nextHidden = nextProps.data.exposedInputsHidden || [];
  if (prevHidden.length !== nextHidden.length) {
    return false;
  }
  for (let i = 0; i < prevHidden.length; i++) {
    if (prevHidden[i] !== nextHidden[i]) {
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

  const properties = nodeMetadata.properties;
  const { allProperties, inlineProperties, inputProperties } = useMemo(() => {
    const all = properties ?? [];
    const inlineFieldNames = new Set(
      resolveInlineFieldNames(nodeMetadata, data).filter(
        (n) => !(isSnippetCodeNode(nodeType, data) && n === "code")
      )
    );
    const inputFieldNames = new Set(
      resolveExposedInputNames(nodeMetadata, data)
    );
    return {
      allProperties: all,
      inlineProperties: all.filter((p) => inlineFieldNames.has(p.name)),
      inputProperties: all.filter((p) => inputFieldNames.has(p.name))
    };
  }, [properties, nodeMetadata, data, nodeType]);

  const BespokeBody = getBespokeBody(nodeMetadata);
  if (BespokeBody) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{
          position: "relative",
          minHeight: 0
        }}
      >
        <BespokeBody
          id={id}
          nodeType={nodeType}
          nodeMetadata={nodeMetadata}
          data={data}
          workflowId={workflowId}
          status={status}
          isOutputNode={isOutputNode}
        />
        <ExposedLabeledInputs
          id={id}
          nodeMetadata={nodeMetadata}
          nodeType={nodeType}
          data={data}
          properties={allProperties}
        />
      </FlexColumn>
    );
  }
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
      <ExposedLabeledInputs
        id={id}
        nodeMetadata={nodeMetadata}
        nodeType={nodeType}
        data={data}
        properties={allProperties}
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
        />
      )}
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </FlexColumn>
  );
};

export { arePropsEqual };
export default memo(NodeContent, arePropsEqual);
