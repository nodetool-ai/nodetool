/** @jsxImportSource @emotion/react */
import { memo } from "react";
import PropertyField from "./PropertyField";
import { Edge } from "reactflow";
import { Property } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";

export interface NodeInputsProps {
  id: string;
  properties: Property[];
  data: NodeData;
  isConstantNode: boolean;
  edges: Edge[];
}

export const NodeInputs = memo(
  function NodeInputs({ id, properties, data, edges, isConstantNode }: NodeInputsProps) {
    return (
      <div className="node-inputs">
        {properties.map((property, index) => (
          <PropertyField
            key={property.name + id}
            id={id}
            data={data}
            property={property}
            propertyIndex={index.toString()}
            skipHandles={isConstantNode}
            edgeConnected={edges.find((edge) => edge.targetHandle === property.name) !==
              undefined} />
        ))}
      </div>
    );
  }
); 