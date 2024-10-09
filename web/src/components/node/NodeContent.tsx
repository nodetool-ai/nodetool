import React from "react";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeProgress } from "./NodeProgress";
import { NodeLogs } from "./NodeLogs";
import { NodeFooter } from "./NodeFooter";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { Edge } from "@xyflow/react";
interface NodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  isSelected: boolean;
  data: NodeData;
  edges: Edge[];
  status: string;
  workflowId: string;
  renderedResult: React.ReactNode;
  isMinZoom: boolean;
  firstOutput: {
    name: string;
    type: {
      type: string;
    };
  };
}

const NodeContent: React.FC<NodeContentProps> = ({
  id,
  nodeType,
  nodeMetadata,
  isConstantNode,
  isOutputNode,
  isSelected,
  data,
  edges,
  status,
  workflowId,
  renderedResult,
  isMinZoom,
  firstOutput
}) => {
  return (
    <>
      <NodeInputs
        id={id}
        layout={nodeMetadata.layout}
        properties={nodeMetadata.properties}
        nodeType={nodeType}
        data={data}
        onlyFields={isConstantNode}
        onlyHandles={false}
        edges={edges}
        isSelected={isSelected}
      />
      {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
      {renderedResult}
      {nodeMetadata.layout === "default" && !isMinZoom && (
        <>
          <ProcessTimer status={status} />
          {status === "running" && (
            <NodeProgress id={id} workflowId={workflowId} />
          )}
          <NodeLogs id={id} workflowId={workflowId} />
          <NodeFooter
            nodeNamespace={nodeMetadata.namespace}
            type={firstOutput.type.type}
            metadata={nodeMetadata}
          />
        </>
      )}
    </>
  );
};

export default NodeContent;
