/** @jsxImportSource @emotion/react */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  TabulatorFull as Tabulator,
  CellComponent,
  Formatter,
  ColumnDefinitionAlign,
  StandardValidatorType,
  RowComponent
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { datetimeEditor, floatEditor, integerEditor } from "./DataTableEditors";
import TableActions from "./TableActions";
import { tableStyles } from "../../../styles/TableStyles";
import { useTheme } from "@mui/material/styles";
import type { TableData } from "./TableActions";

export type DictDataType = "int" | "string" | "datetime" | "float";

/**
 * Union type for all possible cell values in a dict table
 */
export type DictCellValue = string | number | boolean | Date | null | undefined;

export type DictTableProps = {
  data: Record<string, DictCellValue>;
  editable: boolean;
  data_type: DictDataType;
  onDataChange?: (newData: Record<string, DictCellValue>) => void;
};

const DictTable: React.FC<DictTableProps> = ({
  data,
  data_type,
  editable,
  onDataChange
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tabulator, setTabulator] = useState<Tabulator>();
  const [showSelect, setShowSelect] = useState(false);
  const [selectedRows, setSelectedRows] = useState<RowComponent[]>([]);

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
        title: "Key",
        field: "key",
        editable: true,
        headerHozAlign: "left" as ColumnDefinitionAlign,
        cssClass: "key"
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

  const onCellEdited = useCallback(
    (cell: CellComponent) => {
      const field = cell.getField();
      const { key: currentKey, value: currentValue } = cell.getData();
      const oldValue = cell.getOldValue();

      let oldKey: string;

      if (field === "key") {
        oldKey = oldValue;
      } else {
        oldKey = currentKey;
      }

      const newData: Record<string, DictCellValue> = {};
      Object.keys(data).forEach((k) => {
        if (k === oldKey) {
          newData[currentKey] = currentValue;
        } else {
          newData[k] = data[k];
        }
      });

      if (onDataChange) {
        onDataChange(newData);
      }
    },
    [data, onDataChange]
  );

  const onChangeRows = useCallback(
    (newData: Record<string, DictCellValue>) => {
      if (onDataChange) {
        onDataChange(newData);
      }
    },
    [onDataChange]
  );

  const tableData = useMemo(
    () =>
      Object.keys(data).map((key) => ({
        key,
        value: data[key]
      })),
    [data]
  );

  useEffect(() => {
    if (!tableRef.current) {return;}

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "300px",
      data: tableData,
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
  }, [tableData, columns, onCellEdited]);

  const theme = useTheme();
  return (
    <div className="dicttable nowheel nodrag" css={tableStyles(theme)}>
      <TableActions
        tabulator={tabulator}
        data={data as unknown as TableData}
        selectedRows={selectedRows}
        showSelect={showSelect}
        setShowSelect={setShowSelect}
        showRowNumbers={false}
        setShowRowNumbers={() => {}}
        editable={editable}
        dataframeColumns={[]}
        onChangeRows={onChangeRows as unknown as (newData: TableData) => void}
      />
      <div ref={tableRef} className="dicttable" />
    </div>
  );
};

export default DictTable;
