/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback
} from "react";
import {
  TabulatorFull as Tabulator,
  ColumnDefinition,
  CellComponent,
  ColumnDefinitionAlign,
  Formatter,
  StandardValidatorType
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { DataframeRef, ColumnDef, Asset } from "../../../stores/ApiTypes";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../../stores/NotificationStore";
import {
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from "@mui/material";
import { integerEditor, floatEditor, datetimeEditor } from "./DataTableEditors";
import { format, isValid, parseISO } from "date-fns";
import Papa, { ParseResult } from "papaparse";
import axios from "axios";

/**
 * Formatter for datetime columns
 */
export const datetimeFormatter: Formatter = (cell) => {
  const value = cell.getValue();
  const date = typeof value === "string" ? parseISO(value) : new Date(value);
  if (isValid(date)) {
    return format(date, "PPpp");
  }
  return value;
};

/**
 * Coerce a value to the correct type
 */
const coerceValue = (value: any, column: ColumnDef) => {
  if (column.data_type === "int") {
    return parseInt(value);
  } else if (column.data_type === "float") {
    return parseFloat(value);
  } else if (column.data_type === "datetime") {
    return value;
  }
  return value;
};

/**
 * Coerce a row to the correct types
 */
const coerceRow = (rownum: number, row: any[], columns: ColumnDef[]) => {
  return columns.reduce(
    (acc, col, index) => {
      acc[col.name] = coerceValue(row[index], col);
      return acc;
    },
    { rownum } as Record<string, any>
  );
};

/**
 * Default value for a column
 */
const defaultValue = (column: ColumnDef) => {
  if (column.data_type === "int") {
    return 0;
  } else if (column.data_type === "float") {
    return 0.0;
  } else if (column.data_type === "datetime") {
    return "";
  }
  return "";
};

/**
 * Default row for a set of columns
 */
const defaultRow = (columns: ColumnDef[]) => {
  return columns.reduce((acc, col) => {
    acc[col.name] = defaultValue(col);
    return acc;
  }, {} as Record<string, any>);
};

const styles = (theme: any) =>
  css({
    "&.datatable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden"
    },
    ".datetime-picker": {
      backgroundColor: theme.palette.c_hl1
    },
    ".tabulator": {
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1,
      height: "200px"
    },
    ".tabulator-tableholder": {
      overflow: "auto",
      paddingBottom: "5em",
      backgroundColor: theme.palette.c_gray2
    },
    ".tabulator .tabulator-col-resize-handle": {
      position: "relative",
      display: "inline-block",
      width: "6px",
      marginLeft: "-3px",
      marginRight: "-3px",
      zIndex: 11,
      verticalAlign: "middle"
    },
    ".tabulator .tabulator-cell.tabulator-editing input": {
      backgroundColor: theme.palette.c_white,
      color: theme.palette.c_black,
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1
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
    ".tabulator .tabulator-cell.tabulator-editing input::selection": {
      backgroundColor: theme.palette.c_hl1
    },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
    {
      transition: "border 0.2s"
    },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=ascending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
    {
      borderBottom: "6px solid" + theme.palette.c_hl1
    },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=descending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
    {
      borderTop: "6px solid" + theme.palette.c_hl1
    },
    // actions
    ".table-actions": {
      display: "flex",
      width: "100%",
      gap: "1px",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      height: "2.5em",
      padding: "0.5em 0 0 0"
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
    },
    ".toggle": {
      height: "2em",
      display: "flex",
      flexDirection: "column",
      gap: ".5em",
      padding: "0",
      margin: "0",
      "& .MuiToggleButton-root": {
        fontSize: theme.fontSizeTinyer,
        color: theme.palette.c_gray5,
        backgroundColor: theme.palette.c_gray0,
        margin: "0",
        border: 0,
        borderRadius: "0",
        lineHeight: "1em",
        textAlign: "left",
        padding: ".5em"
      },
      "& .MuiToggleButton-root:hover, & .MuiToggleButton-root.Mui-selected:hover":
      {
        color: theme.palette.c_hl1
      },
      "& .MuiToggleButton-root.Mui-selected": {
        color: theme.palette.c_white
      }
    },
    // datetime
    ".tabulator .tabulator-cell.tabulator-editing.datetime input": {
      padding: ".5em",
      borderRadius: "0",
      backgroundColor: "white"
    },
    ".datetime button": {
      position: "absolute",
      width: "20px",
      height: "20px",
      padding: 0,
      top: "0",
      right: ".5em",
      borderRadius: "0",
      backgroundColor: "white"
    },
    ".datetime button:hover svg": {
      color: theme.palette.c_hl1
    },
    ".datetime button svg": {
      color: theme.palette.c_black,
      width: "100%",
      height: "100%"
    },
    ".datetime fieldset": {
      border: 0
    },
    // row select
    ".tabulator-row .tabulator-cell.row-select, .tabulator .tabulator-header .tabulator-col.row-select .tabulator-col-content, .tabulator-header .tabulator-col.row-select":
    {
      width: "25px !important",
      minWidth: "25px !important",
      textAlign: "left",
      padding: "0 !important"
    }
  });

interface DataTableProps {
  dataframe: DataframeRef;
  editable?: boolean;
  onChange?: (data: DataframeRef) => void;
}

const DataTable: React.FC<DataTableProps> = ({
  dataframe,
  onChange,
  editable
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tabulator, setTabulator] = useState<Tabulator>();
  const { writeClipboard } = useClipboard();
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [showSelect, setShowSelect] = useState(true);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const downloadAssetContent = useCallback(
    async (
      asset: Asset,
    ) => {
      if (!asset?.get_url) {
        return;
      }
      const response = await axios.get(asset?.get_url, {
        responseType: "arraybuffer"
      });
      const csv = new TextDecoder().decode(new Uint8Array(response.data));
      const res: ParseResult<string[]> = Papa.parse(csv);
      const columnDefs = res.data[0].map((col: string) => ({
        name: col,
        data_type: "string"
      }));
      const data = res.data.slice(1);
    },
    []
  );

  const data = useMemo(() => {
    if (!dataframe.data) return [];
    return dataframe.data.map((row, index) => {
      return coerceRow(index, row, dataframe.columns || []);
    });
  }, [dataframe.columns, dataframe.data]);

  const onChangeRows = useCallback(
    (newData: any[]) => {
      if (onChange) {
        onChange({
          ...dataframe,
          data: newData.map(
            (row) => dataframe.columns?.map((col) => row[col.name]) || []
          )
        });
      }
    },
    [dataframe, onChange]
  );

  const columns: ColumnDefinition[] = useMemo(() => {
    if (!dataframe.columns) return [];
    const cols: ColumnDefinition[] = [
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
      ...(showRowNumbers
        ? [
          {
            title: "",
            field: "rownum",
            formatter: "rownum" as Formatter,
            hozAlign: "left" as ColumnDefinitionAlign,
            headerSort: false,
            resizable: true,
            frozen: true,
            rowHandle: true,
            editable: false,
            cssClass: "row-numbers"
          }
        ]
        : []),
      ...dataframe.columns.map((col) => ({
        title: col.name,
        field: col.name,
        headerTooltip: col.data_type,
        editable: editable,
        formatter: col.data_type === "datetime" ? datetimeFormatter : undefined,
        editor:
          col.data_type === "int"
            ? integerEditor
            : col.data_type === "float"
              ? floatEditor
              : col.data_type === "datetime"
                ? datetimeEditor
                : "input",
        headerHozAlign: "left" as ColumnDefinitionAlign,
        cssClass: col.data_type,
        validator:
          col.data_type === "int"
            ? (["required", "integer"] as StandardValidatorType[])
            : col.data_type === "float"
              ? (["required", "numeric"] as StandardValidatorType[])
              : col.data_type === "datetime"
                ? (["required", "date"] as StandardValidatorType[])
                : undefined
      }))
    ];
    return cols;
  }, [dataframe.columns, editable, showRowNumbers, showSelect]);

  const onCellEdited = useCallback(
    (cell: CellComponent) => {
      const rownum = cell.getData().rownum;
      onChangeRows(
        data.map((row, index) => {
          if (!row) {
            return {};
          }
          const newRow = { ...row };

          if (index === rownum) {
            newRow[cell.getField()] = cell.getValue();
          }
          return newRow;
        })
      );
    },
    [data, onChangeRows]
  );

  useEffect(() => {
    if (!tableRef.current) return;

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "300px",
      data: data,
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
  }, [data, columns, onCellEdited, dataframe.columns]);

  const handleClick = useCallback(() => {
    const dataWithoutRowNum = data.map((row) => {
      const newRow = { ...row };
      delete newRow.rownum;
      return newRow;
    });
    writeClipboard(JSON.stringify(dataWithoutRowNum), true);
    addNotification({
      content: "Copied to clipboard",
      type: "success",
      alert: true
    });
  }, [writeClipboard, data, addNotification]);

  const handleAddRow = useCallback(() => {
    const newRow = defaultRow(dataframe.columns || []);
    onChangeRows([...data, newRow]);
  }, [data, dataframe, onChangeRows]);

  const handleDeleteRows = useCallback(() => {
    onChangeRows(
      data.filter((row, index) => {
        return !selectedRows.some(
          (selectedRow) => selectedRow.getData().rownum === index
        );
      })
    );
    setSelectedRows([]);
  }, [onChangeRows, data, selectedRows]);

  const handleResetSorting = useCallback(() => {
    if (tabulator) {
      tabulator.clearSort();
    }
  }, [tabulator]);

  return (
    <div className="datatable nowheel nodrag" css={styles}>
      <div className="table-actions">
        <Tooltip title="Copy table data to clipboard">
          <Button variant="outlined" onClick={handleClick}>
            Copy Data
          </Button>
        </Tooltip>

        <Tooltip title="Reset table sorting">
          <Button variant="outlined" onClick={handleResetSorting}>
            Reset Sorting
          </Button>
        </Tooltip>

        {editable && (
          <>
            <Tooltip title="Add new row">
              <Button variant="outlined" onClick={handleAddRow}>
                Add Row
              </Button>
            </Tooltip>

            <Tooltip title="Delete selected rows">
              <Button
                className={selectedRows.length > 0 ? "" : " disabled"}
                variant="outlined"
                onClick={() => {
                  if (tabulator?.getSelectedRows().length) {
                    handleDeleteRows();
                  }
                }}
              >
                Delete Rows
              </Button>
            </Tooltip>
          </>
        )}

        <Tooltip title="Show Select column">
          <ToggleButtonGroup
            className="toggle select-row"
            value={showSelect ? "selected" : null}
            exclusive
            onChange={() => setShowSelect(!showSelect)}
          >
            <ToggleButton value="selected">Show Select</ToggleButton>
          </ToggleButtonGroup>
        </Tooltip>

        <Tooltip title="Show Row Numbers">
          <ToggleButtonGroup
            className="toggle row-numbers"
            value={showRowNumbers ? "selected" : null}
            exclusive
            onChange={() => setShowRowNumbers(!showRowNumbers)}
          >
            <ToggleButton value="selected">Show Row Numbers</ToggleButton>
          </ToggleButtonGroup>
        </Tooltip>
      </div>
      <div ref={tableRef} className="datatable" />
    </div>
  );
};

export default DataTable;
