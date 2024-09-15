import React from "react";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeProgress } from "./NodeProgress";
import { NodeLogs } from "./NodeLogs";
import { NodeFooter } from "./NodeFooter";

interface NodeContentProps {
  id: string;
  nodeMetadata: any;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: any;
  edges: any[];
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
  nodeMetadata,
  isConstantNode,
  isOutputNode,
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
        nodeType={nodeMetadata.type}
        data={data}
        onlyFields={isConstantNode}
        onlyHandles={false}
        edges={edges}
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

export default React.memo(NodeContent);
