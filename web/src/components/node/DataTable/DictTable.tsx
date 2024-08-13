/** @jsxImportSource @emotion/react */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  TabulatorFull as Tabulator,
  CellComponent,
  Formatter,
  ColumnDefinitionAlign,
  StandardValidatorType,
  RowComponent,
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { datetimeEditor, floatEditor, integerEditor } from "./DataTableEditors";
import TableActions from "./TableActions";
import { tableStyles } from "../../../styles/TableStyles";

export type DictDataType = "int" | "string" | "datetime" | "float";
export type DictTableProps = {
  data: Record<string, any>;
  editable: boolean;
  data_type: DictDataType;
  onDataChange?: (newData: Record<string, any>) => void;
};

const DictTable: React.FC<DictTableProps> = ({
  data,
  data_type,
  editable,
  onDataChange,
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
              cellClick: function (e: any, cell: CellComponent) {
                cell.getRow().toggleSelect();
              },
              editable: false,
              cssClass: "row-select",
            },
          ]
        : []),
      {
        title: "Key",
        field: "key",
        editable: true,
        headerHozAlign: "left" as ColumnDefinitionAlign,
        cssClass: "key",
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
            : undefined,
      },
    ],
    [data_type, editable, showSelect]
  );

  const onCellEdited = useCallback(
    (cell: CellComponent) => {
      const { key: oldKey } = cell.getOldValue() || cell.getInitialValue();
      const { key, value } = cell.getData();
      const newData = Object.keys(data).reduce((acc, k) => {
        if (k !== oldKey) {
          acc[k] = data[k];
        }
        return acc;
      }, {} as Record<string, any>);
      newData[key] = value;
      if (onDataChange) {
        onDataChange(newData);
      }
    },
    [data, onDataChange]
  );

  const onChangeRows = useCallback(
    (newData: any[] | Record<string, any>) => {
      if (onDataChange) {
        if (Array.isArray(newData)) {
          const updatedData = newData.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
          }, {} as Record<string, any>);
          onDataChange(updatedData);
        } else {
          onDataChange(newData);
        }
      }
    },
    [onDataChange]
  );

  useEffect(() => {
    if (!tableRef.current) return;

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "300px",
      data: Object.keys(data).map((key) => ({
        key,
        value: data[key],
      })),
      columns: columns,
      columnDefaults: {
        headerSort: true,
        hozAlign: "left",
        headerHozAlign: "left",
        editor: "input",
        resizable: true,
        editorParams: {
          elementAttributes: { spellcheck: "false" },
        },
      },
      movableRows: true,
      selectable: true,
    });

    tabulatorInstance.on("cellEdited", onCellEdited);
    tabulatorInstance.on("rowSelectionChanged", (data, rows) => {
      setSelectedRows(rows);
    });
    setTabulator(tabulatorInstance);

    return () => {
      tabulatorInstance.destroy();
    };
  }, [data, columns, onCellEdited]);

  return (
    <div className="dicttable nowheel nodrag" css={tableStyles}>
      <TableActions
        tabulator={tabulator}
        data={data}
        selectedRows={selectedRows}
        showSelect={showSelect}
        setShowSelect={setShowSelect}
        showRowNumbers={false}
        setShowRowNumbers={() => {}}
        editable={editable}
        dataframeColumns={[]}
        onChangeRows={onChangeRows}
      />
      <div ref={tableRef} className="dicttable" />
    </div>
  );
};

export default DictTable;
