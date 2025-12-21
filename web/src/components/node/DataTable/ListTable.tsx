/** @jsxImportSource @emotion/react */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
import type { Theme } from "@mui/material/styles";

export type ListDataType = "int" | "string" | "datetime" | "float";
export type ListTableProps = {
  data: any[];
  editable: boolean;
  onDataChange?: (newData: any[]) => void;
  data_type: ListDataType;
};

const coerceValue = (value: any, type: ListDataType) => {
  let intValue: number;
  let floatValue: number;

  if (value === "" || value === null || value === undefined) {
    switch (type) {
      case "int":
        return 0;
      case "float":
        return 0.0;
      default:
        return value;
    }
  }

  switch (type) {
    case "int":
      intValue = parseInt(value);
      return isNaN(intValue) ? 0 : intValue;
    case "float":
      floatValue = parseFloat(value);
      return isNaN(floatValue) ? 0.0 : floatValue;
    case "datetime":
      return new Date(value);
    default:
      return value;
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

  const [selectedRows, setSelectedRows] = useState<any[]>([]);
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
              cellClick: function (e: any, cell: CellComponent) {
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

  const onCellEdited = useCallback(
    (cell: CellComponent) => {
      const { rownum, value } = cell.getData();
      const newData = data.map((row, index) => {
        if (index === rownum) {
          return value;
        } else {
          return row;
        }
      });
      if (onDataChange) {
        onDataChange(newData);
      }
    },
    [data, onDataChange]
  );

  const onChangeRows = useCallback(
    (newData: any[] | Record<string, any>) => {
      if (onDataChange) {
        onDataChange(Array.isArray(newData) ? newData : Object.values(newData));
      }
    },
    [onDataChange]
  );

  useEffect(() => {
    if (!tableRef.current) {return;}

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "100%",
      data: data.map((value, index) => ({
        rownum: index,
        value: coerceValue(value, data_type)
      })),
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
  }, [data, columns, onCellEdited, data_type]);

  const theme = useTheme();
  return (
    <div className="listtable nowheel nodrag" css={tableStyles(theme)}>
      <TableActions
        tabulator={tabulator}
        data={data}
        selectedRows={selectedRows}
        onChangeRows={onChangeRows}
        showSelect={showSelect}
        setShowSelect={setShowSelect}
        editable={editable}
        isListTable={true}
      />
      <div ref={tableRef} className="listtable" />
    </div>
  );
};

export default ListTable;
