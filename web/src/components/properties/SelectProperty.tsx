import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "../../utils/isEqual";
import Select from "../inputs/Select";
import PropertyLabel from "../node/PropertyLabel";
import { useNodes } from "../../contexts/NodeContext";

/**
 * SelectProperty renders a dropdown for Select/SelectInput nodes.
 * Unlike EnumProperty, it reads the options from the node's "options" property
 * rather than from the property type metadata.
 */
const SelectProperty: React.FC<PropertyProps<string>> = ({
  property,
  propertyIndex,
  nodeId,
  value,
  onChange,
  tabIndex,
  changed
}) => {
  const { t } = useTranslation();
  const id = useMemo(
    () => `select-${property.name}-${propertyIndex}`,
    [property.name, propertyIndex]
  );

  // Subscribe to the options themselves: this component is memoized on its
  // props, and option edits change none of them.
  const nodeOptions = useNodes(
    (state) => state.findNode(nodeId)?.data?.properties?.options,
    isEqual
  );
  const options = useMemo(() => {
    if (Array.isArray(nodeOptions)) {
      return nodeOptions.filter((opt): opt is string => typeof opt === "string");
    }
    return [];
  }, [nodeOptions]);

  const selectOptions = useMemo(() => {
    return options.map((opt) => ({
      label: opt.toString(),
      value: opt
    }));
  }, [options]);

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
        options={selectOptions}
        label={property.name}
        placeholder={t("i18n-next75.properties.selectPlaceholder")}
        tabIndex={tabIndex}
        changed={changed}
      />
    </div>
  );
};

export default memo(SelectProperty, isEqual);
