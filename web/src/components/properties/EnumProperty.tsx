import React, { memo, useMemo, useCallback } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";
import Select from "../inputs/Select";

const EnumProperty: React.FC<PropertyProps> = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex
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

  return (
    <div className="enum-property">
      <Select
        value={value || ""}
        onChange={onChange}
        options={
          values?.map((value) => ({
            label: value.toString(),
            value: value
          })) || []
        }
        label={property.name}
        placeholder={property.name}
        tabIndex={tabIndex}
      />
    </div>
  );
};

export default memo(EnumProperty, isEqual);
