import React, { memo, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "fast-deep-equal";
import Select from "../inputs/Select";
import PropertyLabel from "../node/PropertyLabel";

const formatEnumLabel = (value: string | number): string => {
  if (typeof value !== "string") {
    return value.toString();
  }

  if (!value.includes("_")) {
    return value;
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// Extended property type to include legacy values/enum fields
interface EnumPropertyExtra {
  values?: (string | number)[];
  enum?: (string | number)[];
}

const EnumProperty: React.FC<PropertyProps> = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  changed
}) => {
  const id = useMemo(
    () => `enum-${property.name}-${propertyIndex}`,
    [property.name, propertyIndex]
  );

  const values = useMemo(() => {
    const extras = property.json_schema_extra as EnumPropertyExtra | undefined;
    return property.type.values ||
           (property.type.type_args?.[0]?.values) ||
           extras?.values ||
           extras?.enum ||
           (property as EnumPropertyExtra).values ||
           (property as EnumPropertyExtra).enum;
  }, [property]);

  const options = useMemo(() => {
    return values?.map((val: string | number) => ({
      label: formatEnumLabel(val),
      value: val
    })) || [];
  }, [values]);

  return (
    <div className="enum-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <Select
        value={value || ""}
        onChange={onChange}
        options={options}
        label={property.name}
        placeholder={property.name}
        tabIndex={tabIndex}
        changed={changed}
      />
    </div>
  );
};

export default memo(EnumProperty, isEqual);
