import React, { memo, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
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
    return property.type.values ||
           (property.type.type_args?.[0]?.values) ||
           (property.json_schema_extra as { values?: (string | number)[]; enum?: (string | number)[] } | undefined)?.values ||
           (property.json_schema_extra as { values?: (string | number)[]; enum?: (string | number)[] } | undefined)?.enum ||
           (property as any).values ||
           (property as any).enum;
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
