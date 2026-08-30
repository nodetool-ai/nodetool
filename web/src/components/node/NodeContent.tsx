import React, { memo, useMemo } from "react";
import { FlexColumn } from "../ui_primitives";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import NodeProgress from "./NodeProgress";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import NodePropertyForm from "./NodePropertyForm";
import { isContentCardNode } from "../node_types/contentCardRegistry";
import ContentCardBody from "../node_types/ContentCardBody";
import CodeBody from "../node_types/CodeBody";
import { getBespokeBody } from "../node_types/editing/bespokeRegistry";
import HandleColumn from "./HandleColumn";
import { isSnippetCodeNode, isCodeBodyNode } from "./codeNodeUi";
import {
  resolveExposedInputNames,
  resolveInlineFieldNames
} from "../../utils/exposedInputs";
import ExposedLabeledInputs from "./ExposedLabeledInputs";
import {
  arePropsEqual,
  type NodeContentProps
} from "./NodeContent.helpers";
import { useNodes } from "../../contexts/NodeContext";
import { useConnectedEdgesSelector } from "../../hooks/nodes/useConnectedEdges";

const FLEX_COLUMN_SX = {
  position: "relative" as const,
  minHeight: 0
};

const NodeContent: React.FC<NodeContentProps> = ({
  id,
  nodeType,
  nodeMetadata,
  isOutputNode,
  data,
  status,
  workflowId
}) => {
  const { handleAddProperty } = useDynamicProperty(
    id,
    data.dynamic_properties
  );

  const connectedEdgesSelector = useConnectedEdgesSelector(id);
  const connectedEdges = useNodes(connectedEdgesSelector);

  const properties = nodeMetadata.properties;
  // Classification reads four `data` fields. Keying it on `data` itself rebuilt
  // all three arrays on every property edit and every streamed result, since
  // those replace the whole blob.
  const {
    exposedInputs,
    exposedInputsLabeled,
    exposedInputsHidden,
    codeNodeMode
  } = data;
  const { allProperties, inlineProperties, inputProperties } = useMemo(() => {
    const placement = {
      exposedInputs,
      exposedInputsLabeled,
      exposedInputsHidden
    };
    const isSnippet = isSnippetCodeNode(nodeType, { codeNodeMode });
    const all = properties ?? [];
    const inlineFieldNames = new Set(
      resolveInlineFieldNames(nodeMetadata, placement).filter(
        (n) => !(isSnippet && n === "code")
      )
    );
    const inputFieldNames = new Set(
      resolveExposedInputNames(nodeMetadata, placement)
    );
    return {
      allProperties: all,
      inlineProperties: all.filter((p) => inlineFieldNames.has(p.name)),
      inputProperties: all.filter((p) => inputFieldNames.has(p.name))
    };
  }, [
    properties,
    nodeMetadata,
    nodeType,
    exposedInputs,
    exposedInputsLabeled,
    exposedInputsHidden,
    codeNodeMode
  ]);

  const BespokeBody = getBespokeBody(nodeMetadata);
  if (BespokeBody) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={FLEX_COLUMN_SX}
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
  if (isCodeBodyNode(nodeMetadata, data)) {
    return (
      <CodeBody
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
      sx={FLEX_COLUMN_SX}
    >
      <HandleColumn
        id={id}
        properties={inputProperties}
        layout="stacked"
        connectedEdges={connectedEdges}
      />
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
      {(nodeMetadata?.supports_dynamic_inputs || nodeMetadata?.supports_dynamic_outputs) && (
        <NodePropertyForm
          id={id}
          isDynamic={nodeMetadata.supports_dynamic_inputs}
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

export default memo(NodeContent, arePropsEqual);
