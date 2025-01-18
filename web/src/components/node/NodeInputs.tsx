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
  showFields?: boolean;
  showHandle?: boolean;
  showAdvancedFields?: boolean;
  basicFields?: string[];
  onUpdatePropertyName?: (
    oldPropertyName: string,
    newPropertyName: string
  ) => void;
  onDeleteProperty?: (propertyName: string) => void;
}

export const NodeInputs: React.FC<NodeInputsProps> = ({
  id,
  properties,
  data,
  nodeType,
  showHandle = true,
  showFields = true,
  layout,
  showAdvancedFields,
  basicFields,
  onDeleteProperty,
  onUpdatePropertyName
}) => {
  // use node id for tab index
  const nodeOffset = parseInt(id) * 100;
  const tabableProperties = properties.filter((property) => {
    const type = property.type;
    return !type.optional && type.type !== "readonly";
  });
  const dynamicProperties: { [key: string]: Property } =
    data.dynamic_properties || {};

  return (
    <div className={`node-inputs node-${id}`}>
      {properties.map((property, index) => {
        const tabIndex = tabableProperties.findIndex(
          (p) => p.name === property.name
        );
        const isTabable = tabIndex !== -1;
        const finalTabIndex = isTabable ? nodeOffset + tabIndex + 1 : -1;
        const isConstantNode =
          property.type.type.startsWith("nodetool.constant");

        return (
          <PropertyField
            key={property.name + id}
            id={id}
            value={data.properties[property.name]}
            nodeType={nodeType}
            layout={layout}
            property={property}
            propertyIndex={index.toString()}
            showFields={showFields}
            showHandle={showHandle && !isConstantNode}
            tabIndex={finalTabIndex}
            isBasicField={basicFields?.includes(property.name)}
            showAdvancedFields={showAdvancedFields}
          />
        );
      })}

      {Object.entries(dynamicProperties).map(([name, value], index) => (
        <PropertyField
          key={`dynamic-${name}-${id}`}
          id={id}
          value={value}
          nodeType={nodeType}
          layout={layout}
          property={{
            name,
            type: {
              type: "str",
              type_args: [],
              optional: false
            }
          }}
          propertyIndex={`dynamic-${index}`}
          showFields={true}
          showHandle={true}
          tabIndex={-1}
          isBasicField={true}
          isDynamicProperty={true}
          showAdvancedFields={showAdvancedFields}
          onDeleteProperty={onDeleteProperty}
          onUpdatePropertyName={onUpdatePropertyName}
        />
      ))}
    </div>
  );
};

export default memo(NodeInputs, isEqual);
