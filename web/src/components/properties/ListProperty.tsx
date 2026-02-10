import { PropertyProps } from "../node/PropertyInput";
import ListTable, { ListDataType } from "../node/DataTable/ListTable";
import { memo, useCallback, useState, useMemo } from "react";
import Select from "../inputs/Select";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";

const detectTypeFromList = (list: unknown[]) => {
  if (list.length === 0) {
    return "string";
  }
  const first = list[0];
  if (typeof first === "number") {
    if (Number.isInteger(first)) {
      return "int";
    }
    return "float";
  } else if (typeof first === "string") {
    return "string";
  } else if (typeof first === "object") {
    return "string";
  }
  return "string";
};

const ListProperty = (props: PropertyProps) => {
  const id = `list-${props.property.name}-${props.propertyIndex}`;
  const dataTypes = useMemo(() => ["int", "string", "datetime", "float"], []);

  const value = props.value || [];
  const [dataType, setDataType] = useState<ListDataType>(
    detectTypeFromList(value)
  );

  const handleDataTypeChange = useCallback(
    (newValue: string) => {
      setDataType(newValue as ListDataType);
    },
    []
  );

  const options = useMemo(
    () =>
      dataTypes.map((type) => ({
        label: type,
        value: type
      })),
    [dataTypes]
  );

  if (props.nodeType === "nodetool.constant.List") {
    return (
      <>
        <div style={{ marginBottom: "8px" }}>
          <PropertyLabel name="Data Type" id={id} />
          <Select
            value={dataType}
            onChange={handleDataTypeChange}
            options={options}
            label="Data Type"
            placeholder="Select type..."
          />
        </div>
        <ListTable
          data={value}
          onDataChange={props.onChange}
          editable={true}
          data_type={dataType}
        />
      </>
    );
  } else {
    return (
      <>
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
      </>
    );
  }
};

export default memo(ListProperty, isEqual);
