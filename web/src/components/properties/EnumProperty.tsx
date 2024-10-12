import React, { memo, useMemo, useCallback } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";

const EnumProperty: React.FC<PropertyProps> = ({
  property,
  propertyIndex,
  value,
  onChange
}) => {
  const id = useMemo(
    () => `enum-${property.name}-${propertyIndex}`,
    [property.name, propertyIndex]
  );

  const values = useMemo(() => {
    return property.type.type === "enum"
      ? property.type.values
      : property.type.type_args?.[0].values;
  }, [property.type]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(event.target.value);
    },
    [onChange]
  );

  return (
    <div className="enum-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <select
        id={id}
        name={property.name}
        value={value || ""}
        onChange={handleChange}
        className="nodrag"
      >
        {values?.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );
};

export default memo(EnumProperty, isEqual);
