import React, { memo, useMemo } from "react";
import { FlexColumn } from "../ui_primitives";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
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
import {
  arePropsEqual,
  type NodeContentProps
} from "./NodeContent.helpers";

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
