import React, { memo, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import Select from "../inputs/Select";
import PropertyLabel from "../node/PropertyLabel";

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
           (property as any).values || 
           (property as any).enum;
  }, [property]);

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
        options={
          values?.map((val: string | number) => ({
            label: val.toString(),
            value: val
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

export default memo(EnumProperty, isEqual);
