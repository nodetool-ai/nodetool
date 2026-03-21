/** @jsxImportSource @emotion/react */

import { useState, useMemo, useRef, useCallback, useEffect, memo } from "react";
import {
  TabulatorFull as Tabulator,
  CellComponent,
  Formatter,
  ColumnDefinitionAlign,
  StandardValidatorType
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { integerEditor, floatEditor, datetimeEditor } from "./DataTableEditors";
import { tableStyles } from "../../../styles/TableStyles";
import TableActions from "./TableActions";
import { useTheme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import type { TableData } from "./TableActions";

export type ListDataType = "int" | "string" | "datetime" | "float";

/**
 * Union type for all possible cell values in a list table
 */
export type ListCellValue = string | number | boolean | Date | null | undefined;

export type ListTableProps = {
  data: ListCellValue[];
  editable: boolean;
  onDataChange?: (newData: ListCellValue[]) => void;
  data_type: ListDataType;
};

const coerceValue = (value: unknown, type: ListDataType): ListCellValue => {
  let intValue: number;
  let floatValue: number;

  if (value === "" || value === null || value === undefined) {
    switch (type) {
      case "int":
        return 0;
      case "float":
        return 0.0;
      default:
        return value as ListCellValue;
    }
  }

  switch (type) {
    case "int":
      intValue = parseInt(value as string);
      return isNaN(intValue) ? 0 : intValue;
    case "float":
      floatValue = parseFloat(value as string);
      return isNaN(floatValue) ? 0.0 : floatValue;
    case "datetime":
      return new Date(value as string);
    default:
      return value as ListCellValue;
  }
};

const ListTable: React.FC<ListTableProps> = ({
  data,
  editable,
  data_type,
  onDataChange
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tabulator, setTabulator] = useState<Tabulator>();

  const [selectedRows, setSelectedRows] = useState<Tabulator.RowComponent[]>([]);
  const [showSelect, setShowSelect] = useState(true);

  const columns = useMemo(
    () => [
      ...(showSelect
        ? [
            {
              title: "",
              field: "select",
              formatter: "rowSelection" as Formatter,
              titleFormatter: "rowSelection" as Formatter,
              hozAlign: "left" as ColumnDefinitionAlign,
              headerSort: false,
              width: 25,
              minWidth: 25,
              resizable: false,
              frozen: true,
              cellClick: function (_e: MouseEvent, cell: CellComponent) {
                cell.getRow().toggleSelect();
              },
              editable: false,
              cssClass: "row-select"
            }
          ]
        : []),
      {
        title: "Index",
        field: "rownum",
        formatter: "rownum" as Formatter,
        hozAlign: "left" as ColumnDefinitionAlign,
        headerSort: false,
        resizable: true,
        frozen: true,
        rowHandle: true,
        editable: false,
        cssClass: "row-numbers"
      },
      {
        title: "Value",
        field: "value",
        editable: editable,
        frozen: !editable,
        editor:
          data_type === "int"
            ? integerEditor
            : data_type === "float"
            ? floatEditor
            : data_type === "datetime"
            ? datetimeEditor
            : "input",
        headerHozAlign: "left" as ColumnDefinitionAlign,
        cssClass: data_type,
        validator:
          data_type === "int"
            ? (["required", "integer"] as StandardValidatorType[])
            : data_type === "float"
            ? (["required", "numeric"] as StandardValidatorType[])
            : data_type === "datetime"
            ? (["required", "date"] as StandardValidatorType[])
            : undefined
      }
    ],
    [data_type, editable, showSelect]
  );

  // Memoize the tabulator data transformation to prevent recreation on every render
  const tabulatorData = useMemo(
    () => data.map((value, index) => ({
        rownum: index,
        value: coerceValue(value, data_type)
      })),
    [data, data_type]
  );

  const onCellEdited = useCallback(
    (cell: CellComponent) => {
      const { rownum, value } = cell.getData();
      // Create new array only when necessary (on cell edit)
      const newData = data.map((row, index) =>
        index === rownum ? value : row
      );
      if (onDataChange) {
        onDataChange(newData);
      }
    },
    [data, onDataChange]
  );

  const onChangeRows = useCallback(
    (newData: ListCellValue[]) => {
      if (onDataChange) {
        onDataChange(newData);
      }
    },
    [onDataChange]
  );

  useEffect(() => {
    if (!tableRef.current) {return;}

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "100%",
      data: tabulatorData,
      columns: columns,
      columnDefaults: {
        headerSort: true,
        hozAlign: "left",
        headerHozAlign: "left",
        editor: "input",
        resizable: true,
        editorParams: {
          elementAttributes: { spellcheck: "false" }
        }
      },
      movableRows: true
    });

    tabulatorInstance.on("cellEdited", onCellEdited);
    tabulatorInstance.on("rowSelectionChanged", (data, rows) => {
      setSelectedRows(rows);
    });

    setTabulator(tabulatorInstance);

    return () => {
      tabulatorInstance.destroy();
    };
  }, [tabulatorData, columns, onCellEdited, data_type]);

  const theme = useTheme();
  return (
    <div className="listtable nowheel nodrag" css={tableStyles(theme)}>
      <TableActions
        tabulator={tabulator}
        data={data as unknown as TableData}
        selectedRows={selectedRows}
        onChangeRows={onChangeRows as unknown as (newData: TableData) => void}
        showSelect={showSelect}
        setShowSelect={setShowSelect}
        editable={editable}
        isListTable={true}
      />
      <div ref={tableRef} className="listtable" />
    </div>
  );
};

ListTable.displayName = "ListTable";

export default memo(ListTable, (prevProps, nextProps) => {
  // Compare primitive props
  return (
    prevProps.data_type === nextProps.data_type &&
    prevProps.editable === nextProps.editable &&
    isEqual(prevProps.data, nextProps.data)
  );
});
