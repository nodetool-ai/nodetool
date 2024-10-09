/** @jsxImportSource @emotion/react */
import { memo } from "react";
import PropertyField from "./PropertyField";
import { Edge } from "@xyflow/react";
import { Property } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";

export interface NodeInputsProps {
  id: string;
  layout?: string;
  nodeType: string;
  isSelected: boolean;
  primaryField?: string;
  secondaryField?: string;
  properties: Property[];
  data: NodeData;
  onlyFields?: boolean;
  onlyHandles?: boolean;
  edges: Edge[];
}

export const NodeInputs = memo(function NodeInputs({
  id,
  properties,
  data,
  edges,
  nodeType,
  isSelected,
  onlyHandles,
  onlyFields,
  layout,
  primaryField,
  secondaryField
}: NodeInputsProps) {
  return (
    <div className="node-inputs">
      {properties.map((property, index) => (
        <PropertyField
          key={property.name + id}
          id={id}
          data={data}
          nodeType={nodeType}
          layout={layout}
          property={property}
          propertyIndex={index.toString()}
          isPrimary={property.name === primaryField}
          isSecondary={property.name === secondaryField}
          onlyInput={onlyFields}
          onlyHandle={onlyHandles}
          edgeConnected={
            edges.find((edge) => edge.targetHandle === property.name) !==
            undefined
          }
          isSelected={isSelected}
        />
      ))}
    </div>
  );
});
