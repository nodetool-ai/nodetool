import React, { memo } from "react";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeLogs } from "./NodeLogs";
import { NodeFooter } from "./NodeFooter";
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
  status: string;
  workflowId: string;
  renderedResult: React.ReactNode;
}

const NodeContent: React.FC<NodeContentProps> = ({
  id,
  nodeType,
  nodeMetadata,
  isConstantNode,
  isOutputNode,
  data,
  status,
  workflowId,
  renderedResult
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
      />
      {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
      {renderedResult}
      {nodeMetadata.layout === "default" && (
        <>
          <ProcessTimer status={status} />
          {status === "running" && (
            <NodeProgress id={id} workflowId={workflowId} />
          )}
          <NodeLogs id={id} workflowId={workflowId} />
          <NodeFooter
            nodeNamespace={nodeMetadata.namespace}
            metadata={nodeMetadata}
          />
        </>
      )}
    </>
  );
};

export default memo(NodeContent, isEqual);
