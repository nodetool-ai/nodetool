import React, { memo, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import Select from "../inputs/Select";
import PropertyLabel from "../node/PropertyLabel";
import { useNodes } from "../../contexts/NodeContext";

/**
 * SelectProperty renders a dropdown for Select/SelectInput nodes.
 * Unlike EnumProperty, it reads the options from the node's "options" property
 * rather than from the property type metadata.
 */
const SelectProperty: React.FC<PropertyProps> = ({
  property,
  propertyIndex,
  nodeId,
  value,
  onChange,
  tabIndex,
  changed
}) => {
  const id = useMemo(
    () => `select-${property.name}-${propertyIndex}`,
    [property.name, propertyIndex]
  );

  // Get the options from the node's properties
  const findNode = useNodes((state) => state.findNode);
  const node = findNode(nodeId);
  const options = useMemo(() => {
    const nodeOptions = node?.data?.properties?.options;
    if (Array.isArray(nodeOptions)) {
      return nodeOptions as string[];
    }
    return [];
  }, [node?.data?.properties?.options]);

  return (
    <div className="select-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <Select
        value={value || ""}
        onChange={onChange}
        options={
          options.map((opt) => ({
            label: opt.toString(),
            value: opt
          })) || []
        }
        label={property.name}
        placeholder={property.name}
        tabIndex={tabIndex}
        changed={changed}
      />
    </div>
  );
};

export default memo(SelectProperty, isEqual);
