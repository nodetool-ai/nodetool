/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { Button, Tooltip } from "@mui/material";
import { datetimeEditor, floatEditor, integerEditor } from "./DataTableEditors";

export type DictDataType = "int" | "string" | "datetime" | "float";

const styles = (theme: any) =>
  css({
    "&.dicttable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden"
    },
    // rows
    ".tabulator-row": {
      minHeight: "20px",
      minWidth: "20px"
    },
    // header
    ".tabulator .tabulator-header": {
      minHeight: "20px",
      maxHeight: "30px",
      fontFamily: theme.fontFamily2,
      wordSpacing: "-.2em",
      fontWeight: "normal"
    },
    // actions
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: ".5em",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2em"
    },
    ".table-actions .disabled": {
      opacity: 0.5
    },
    ".table-actions button": {
      lineHeight: "1em",
      textAlign: "left",
      padding: ".5em",
      border: 0,
      fontSize: theme.fontSizeTinyer,
      color: theme.palette.c_gray6,
      margin: "0",
      borderRadius: "0",
      backgroundColor: theme.palette.c_gray0
    },
    ".table-actions button:hover": {
      color: theme.palette.c_hl1
    }
  });

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
  onDataChange
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tabulator, setTabulator] = useState<Tabulator>();
  const { writeClipboard } = useClipboard();
  const [showSelect, setShowSelect] = useState(false);
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

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

  const addRow = useCallback(() => {
    if (!onDataChange) return;
    const newData = { ...data, "": "" };
    onDataChange(newData);
  }, [data, onDataChange]);

  console.log(selectedRows);

  const removeSelectedRows = useCallback(() => {
    if (!onDataChange) return;
    const newData = Object.keys(data).reduce((acc, key) => {
      if (!selectedRows.some((row) => row.key === key)) {
        acc[key] = data[key];
      }
      return acc;
    }, {} as Record<string, any>);
    onDataChange(newData);
  }, [data, onDataChange, selectedRows]);

  useEffect(() => {
    if (!tableRef.current) return;

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "300px",
      data: Object.keys(data).map((key) => ({
        key,
        value: data[key]
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
    tabulatorInstance.on("rowSelectionChanged", (rows: any) => {
      setSelectedRows(rows);
    });
    setTabulator(tabulatorInstance);

    return () => {
      tabulatorInstance.destroy();
    };
  }, [data, columns, onCellEdited]);

  const copyData = useCallback(() => {
    if (tabulator) {
      const data = tabulator.getData().reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {} as Record<string, any>);
      writeClipboard(JSON.stringify(data), true);
      addNotification({
        content: "Copied to clipboard",
        type: "success",
        alert: true
      });
    }
  }, [tabulator, writeClipboard, addNotification]);

  return (
    <div className="dicttable nowheel nodrag" css={styles}>
      <div className="table-actions">
        <Tooltip title="Copy table data to clipboard">
          <Button variant="outlined" onClick={copyData}>
            Copy Data
          </Button>
        </Tooltip>
        <Tooltip title="Show Select column">
          <Button variant="outlined" onClick={() => setShowSelect(!showSelect)}>
            Show Select
          </Button>
        </Tooltip>
        {editable && (
          <>
            <Tooltip title="Add a new row">
              <Button variant="outlined" onClick={addRow}>
                Add Row
              </Button>
            </Tooltip>
            <Tooltip title="Delete selected rows">
              <Button variant="outlined" onClick={removeSelectedRows}>
                Delete Row
              </Button>
            </Tooltip>
          </>
        )}
      </div>
      <div ref={tableRef} className="dicttable" />
    </div>
  );
};

export default DictTable;
