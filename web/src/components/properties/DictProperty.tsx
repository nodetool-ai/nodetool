import { PropertyProps } from "../node/PropertyInput";
import { memo, useCallback, useState, useMemo } from "react";
import Select from "../inputs/Select";
import DictTable, { DictCellValue, DictDataType } from "../node/DataTable/DictTable";
import PropertyLabel from "../node/PropertyLabel";
import { SPACING, getSpacingPx } from "../ui_primitives";
import isEqual from "../../utils/isEqual";
import { isNumber, isString } from "../../utils/typePredicates";

const detectTypeFromDict = (dict: unknown): DictDataType => {
  if (!Array.isArray(dict) || dict.length === 0) {
    return "string";
  }
  const first: unknown = dict[0];
  if (isNumber(first)) {
    if (Number.isInteger(first)) {
      return "int";
    }
    return "float";
  } else if (isString(first)) {
    return "string";
  } else if (typeof first === "object") {
    return "string";
  }
  return "string";
};

const DictProperty = (props: PropertyProps<Record<string, DictCellValue>>) => {
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

  const containerStyle = useMemo(() => ({ marginBottom: getSpacingPx(SPACING.md) }), []);

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
      <div style={containerStyle}>
        <PropertyLabel name="Data Type" id={id} />
        <Select
          value={dataType}
          onChange={handleDataTypeChange}
          options={options}
          label="Data Type"
          placeholder="Select type..."
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
