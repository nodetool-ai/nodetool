import React, { memo } from "react";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeLogs } from "./NodeLogs";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { isEqual } from "lodash";
import NodeProgress from "./NodeProgress";

interface NodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: NodeData;
  basicFields: string[];
  showAdvancedFields: boolean;
  status: string;
  workflowId: string;
  renderedResult: React.ReactNode;
  onDeleteProperty: (propertyName: string) => void;
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
  status,
  workflowId,
  renderedResult,
  onDeleteProperty
}) => {
  return (
    <>
      <NodeInputs
        id={id}
        layout={nodeMetadata.layout}
        properties={nodeMetadata.properties}
        nodeType={nodeType}
        data={data}
        showHandle={!isConstantNode}
        showAdvancedFields={showAdvancedFields}
        basicFields={basicFields}
        onDeleteProperty={onDeleteProperty}
      />
      {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
      {renderedResult}
      <ProcessTimer status={status} />
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
      <NodeLogs id={id} workflowId={workflowId} />
    </>
  );
};

export default memo(NodeContent, isEqual);
