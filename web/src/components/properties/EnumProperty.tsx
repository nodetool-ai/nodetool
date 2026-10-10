import React, { memo, useCallback, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "../../utils/isEqual";
import Select from "../inputs/Select";
import PropertyLabel from "../node/PropertyLabel";
import { isString } from "../../utils/typePredicates";

const formatEnumLabel = (value: string | number): string => {
  if (!isString(value)) {
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

const EnumProperty: React.FC<PropertyProps<string | number>> = ({
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
      value: String(val)
    })) || [];
  }, [values]);

  // Select works on strings. Map the picked option back to the declared value
  // so an int enum such as [2, 4] keeps writing numbers.
  const handleChange = useCallback(
    (next: string) => {
      const match = values?.find((val) => String(val) === next);
      onChange(match ?? next);
    },
    [values, onChange]
  );

  return (
    <div className="enum-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <Select
        value={value === undefined || value === null ? "" : String(value)}
        onChange={handleChange}
        options={options}
        label={property.name}
        placeholder="Select…"
        tabIndex={tabIndex}
        changed={changed}
      />
    </div>
  );
};

export default memo(EnumProperty, isEqual);
