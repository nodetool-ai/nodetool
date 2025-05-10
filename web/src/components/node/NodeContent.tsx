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
  hasAdvancedFields: boolean;
  onToggleAdvancedFields: () => void;
  status: string;
  workflowId: string;
  renderedResult: React.ReactNode;
  onDeleteProperty: (propertyName: string) => void;
  onUpdatePropertyName: (
    oldPropertyName: string,
    newPropertyName: string
  ) => void;
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
  renderedResult,
  onDeleteProperty,
  onUpdatePropertyName
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
        hasAdvancedFields={hasAdvancedFields}
        showAdvancedFields={showAdvancedFields}
        basicFields={basicFields}
        onToggleAdvancedFields={onToggleAdvancedFields}
        onDeleteProperty={onDeleteProperty}
        onUpdatePropertyName={onUpdatePropertyName}
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
