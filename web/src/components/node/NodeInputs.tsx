/** @jsxImportSource @emotion/react */
import { memo } from "react";
import PropertyField from "./PropertyField";
import { Property } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { isEqual } from "lodash";

export interface NodeInputsProps {
  id: string;
  layout?: string;
  nodeType: string;
  properties: Property[];
  data: NodeData;
  onlyFields?: boolean;
  onlyHandles?: boolean;
}

export const NodeInputs: React.FC<NodeInputsProps> = ({
  id,
  properties,
  data,
  nodeType,
  onlyHandles,
  onlyFields,
  layout
}) => {
  return (
    <div className="node-inputs">
      {properties.map((property, index) => (
        <PropertyField
          key={property.name + id}
          id={id}
          value={data.properties[property.name]}
          nodeType={nodeType}
          layout={layout}
          property={property}
          propertyIndex={index.toString()}
          onlyInput={onlyFields}
          onlyHandle={onlyHandles}
        />
      ))}
    </div>
  );
};

export default memo(NodeInputs, isEqual);
