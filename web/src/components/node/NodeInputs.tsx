/** @jsxImportSource @emotion/react */
import { memo } from "react";
import PropertyField from "./PropertyField";
import { Edge } from "reactflow";
import { Property } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";

export interface NodeInputsProps {
  id: string;
  layout: string;
  primaryField: string;
  secondaryField: string;
  properties: Property[];
  data: NodeData;
  isConstantNode: boolean;
  edges: Edge[];
}

export const NodeInputs = memo(
  function NodeInputs({ id, properties, data, edges, isConstantNode, layout, primaryField, secondaryField }: NodeInputsProps) {
    return (
      <div className="node-inputs">
        {properties.map((property, index) => (
          <PropertyField
            key={property.name + id}
            id={id}
            data={data}
            layout={layout}
            property={property}
            propertyIndex={index.toString()}
            isPrimary={property.name === primaryField}
            isSecondary={property.name === secondaryField}
            skipHandles={isConstantNode}
            edgeConnected={edges.find((edge) => edge.targetHandle === property.name) !==
              undefined} />
        ))}
      </div>
    );
  }
); 