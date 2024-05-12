import { useCallback, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { ColumnDef, DataframeRef } from "../../stores/ApiTypes";
import DataTable from "../node/DataTable";
import PropertyLabel from "../node/PropertyLabel";
import ColumnsManager from "../node/ColumnsManager";
import { Button, ButtonGroup } from "@mui/material";
import AddColumnIcon from "@mui/icons-material/Add";
import AddRowIcon from "@mui/icons-material/AddBox";


export default function DataframeProperty({ value, onChange, nodeType, property, propertyIndex }: PropertyProps) {
  const id = `${property.name}-${propertyIndex}`;

  const onCellChange = useCallback((df: DataframeRef) => {
    onChange(df);
  }, [onChange]);

  const onChangeColumns = useCallback((columns: ColumnDef[]) => {
    onChange({
      ...value,
      columns
    });
  }, [value, onChange]);

  const addRow = useCallback(() => {
    const newRow = Array(value.columns?.length).fill("");
    onChange({
      ...value,
      data: (value.data || []).concat([newRow])
    });
  }, [onChange, value]);

  const addColumn = useCallback(() => {
    const columns = value.columns || [];
    const newColumn: ColumnDef = {
      name: "New Column",
      data_type: "object"
    };
    onChange({
      ...value,
      columns: [
        ...columns,
        newColumn
      ]
    });
  }, [onChange, value]);

  if (nodeType === "nodetool.constant.DataFrame") {
    return <>
      <ButtonGroup>
        <Button onClick={addColumn}>
          <AddColumnIcon /> Add Column
        </Button>
        <Button onClick={addRow}>
          <AddRowIcon /> Add Row
        </Button>
      </ButtonGroup>
      <ColumnsManager columns={value.columns || []} onChange={onChangeColumns} />
      <DataTable dataframe={value} onChange={onCellChange} />
    </>;
  } else {
    return (
      <>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
      </>
    );
  }
}