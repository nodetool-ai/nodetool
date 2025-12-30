import { PropertyProps } from "../node/PropertyInput";
import { memo, useCallback, useState, useMemo } from "react";
import Select from "../inputs/Select";
import DictTable, { DictDataType } from "../node/DataTable/DictTable";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";

const detectTypeFromDict = (dict: any) => {
  if (!Array.isArray(dict) || dict.length === 0) {
    return "string";
  }
  const first = dict[0];
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

const DictProperty = (props: PropertyProps) => {
  const id = `list-${props.property.name}-${props.propertyIndex}`;
  const dataTypes = useMemo(() => ["int", "string", "datetime", "float"], []);
  
  const [dataType, setDataType] = useState<DictDataType>(
    detectTypeFromDict(props.value)
  );

  const handleDataTypeChange = useCallback(
    (newValue: string) => {
      setDataType(newValue as DictDataType);
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

  const property = props.property;

  if (props.nodeType !== "nodetool.constant.Dict") {
    return (
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
    );
  }

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
          changed={props.changed}
        />
      </div>
      <DictTable
        data={props.value}
        onDataChange={props.onChange}
        editable={true}
        data_type={dataType}
      />
    </>
  );
};

export default memo(DictProperty, isEqual);
