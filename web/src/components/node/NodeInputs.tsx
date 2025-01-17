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
  onDeleteProperty?: (propertyName: string) => void;
}

const isDropdownProperty = (property: Property): boolean => {
  const type = property.type.type;

  // Check for model types that use dropdowns
  const modelPrefixes = [
    "function_model",
    "language_model",
    "llama_model",
    "comfy.",
    "hf."
  ];
  const isModel = modelPrefixes.some((prefix) => type.startsWith(prefix));
  return isModel;
};

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
  onDeleteProperty
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
            showHandle={
              showHandle && !isDropdownProperty(property) && !isConstantNode
            }
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
        />
      ))}
    </div>
  );
};

export default memo(NodeInputs, isEqual);
