import { PropertyProps } from "../node/PropertyInput";
import { memo, useCallback, useState, useMemo } from "react";
import Select from "../inputs/Select";
import DictTable, { DictCellValue, DictDataType } from "../node/DataTable/DictTable";
import PropertyLabel from "../node/PropertyLabel";
import { SPACING, getSpacingPx } from "../ui_primitives";
import isEqual from "../../utils/isEqual";
import { isNumber, isObjectLike } from "../../utils/typePredicates";

// A dict is an object, so read the type from its first value.
const detectTypeFromDict = (dict: unknown): DictDataType => {
  if (!isObjectLike(dict) || Array.isArray(dict)) {
    return "string";
  }
  const first = Object.values(dict)[0];
  if (isNumber(first)) {
    return Number.isInteger(first) ? "int" : "float";
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
