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
}

const isDropdownProperty = (property: Property): boolean => {
  const type = property.type.type;
  console.debug(`Property ${property.name}: type=${type}`);

  // Check for enum type
  if (type === "enum" || type === "collection") {
    console.debug(`Property ${property.name} is dropdown (enum/collection)`);
    return true;
  }

  // Check for model types that use dropdowns
  const modelPrefixes = [
    "function_model",
    "language_model",
    "llama_model",
    "comfy.",
    "hf."
  ];
  const isModel = modelPrefixes.some((prefix) => type.startsWith(prefix));
  console.debug(
    `Property ${property.name} is${isModel ? "" : " not"} a model dropdown`
  );
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
    </div>
  );
};

export default memo(NodeInputs, isEqual);
