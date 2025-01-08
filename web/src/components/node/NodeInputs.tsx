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
  showAdvancedFields?: boolean;
  basicFields?: string[];
}

export const NodeInputs: React.FC<NodeInputsProps> = ({
  id,
  properties,
  data,
  nodeType,
  onlyHandles,
  onlyFields,
  layout,
  showAdvancedFields,
  basicFields
}) => {
  // use node id for tab index
  const nodeOffset = parseInt(id) * 100;
  const tabableProperties = properties.filter((property) => {
    const type = property.type;
    return !type.optional && type.type !== "readonly";
  });

  return (
    <div className={`node-inputs node-${id}`}>
      {properties.map((property, index) => {
        const tabIndex = tabableProperties.findIndex(
          (p) => p.name === property.name
        );
        const isTabable = tabIndex !== -1;
        const finalTabIndex = isTabable ? nodeOffset + tabIndex + 1 : -1;

        return (
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
            tabIndex={finalTabIndex}
            isBasicField={basicFields?.includes(property.name)}
            showAdvancedFields={showAdvancedFields}
          />
        );
      })}
    </div>
  );
};

export default memo(NodeInputs, isEqual);
