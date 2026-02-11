/** @jsxImportSource @emotion/react */

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo
} from "react";
import {
  TabulatorFull as Tabulator,
  ColumnDefinition,
  CellComponent,
  ColumnDefinitionAlign,
  Formatter,
  StandardValidatorType,
  RowComponent
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { DataframeRef, ColumnDef } from "../../../stores/ApiTypes";

import TableActions from "./TableActions";
import { integerEditor, floatEditor, datetimeEditor } from "./DataTableEditors";
import { format, isValid, parseISO } from "date-fns";
import { tableStyles } from "../../../styles/TableStyles";
import { useTheme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";

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
const coerceValue = (value: string | number | Date, column: ColumnDef) => {
  if (column.data_type === "int") {
    return parseInt(String(value));
  } else if (column.data_type === "float") {
    return parseFloat(String(value));
  } else if (column.data_type === "datetime") {
    return value;
  }
  return value;
};

/**
 * Coerce a row to the correct types
 */
const coerceRow = (rownum: number, row: unknown[], columns: ColumnDef[]) => {
  return columns.reduce(
    (acc, col, index) => {
      acc[col.name] = coerceValue(row[index] as string | number | Date, col);
      return acc;
    },
    { rownum } as Record<string, unknown>
  );
};

interface DataTableProps {
  dataframe: DataframeRef;
  editable?: boolean;
  onChange?: (data: DataframeRef) => void;
  isModalMode?: boolean;
  searchFilter?: string;
}

const DataTable: React.FC<DataTableProps> = ({
  dataframe,
  onChange,
  editable,
  isModalMode = false,
  searchFilter = ""
}) => {
  const theme = useTheme();
  const tableRef = useRef<HTMLDivElement>(null);
  const tabulatorRef = useRef<Tabulator | null>(null);
  const [tabulator, setTabulator] = useState<Tabulator>();
  const [selectedRows, setSelectedRows] = useState<RowComponent[]>([]);
  const [showSelect, setShowSelect] = useState(true);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
  const [isTableReady, setIsTableReady] = useState(false);
  
  // Track undo/redo availability
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // Track if we're in the middle of a Tabulator edit to avoid clearing history
  const isInternalEditRef = useRef(false);
  
  // Update undo/redo availability
  const updateHistoryState = useCallback(() => {
    if (tabulatorRef.current && isModalMode) {
      const undoSize = tabulatorRef.current.getHistoryUndoSize();
      const redoSize = tabulatorRef.current.getHistoryRedoSize();
      setCanUndo(typeof undoSize === "number" && undoSize > 0);
      setCanRedo(typeof redoSize === "number" && redoSize > 0);
    }
  }, [isModalMode]);

  // Store dataframe ref in a ref to avoid stale closures
  const dataframeRef = useRef(dataframe);
  dataframeRef.current = dataframe;

  const data = useMemo(() => {
    if (!dataframe.data) {return [];}
    return dataframe.data.map((row, index) => {
      return coerceRow(index, row, dataframe.columns || []);
    });
  }, [dataframe.columns, dataframe.data]);

  const onChangeRows = useCallback(
    (newData: Record<string, unknown>[] | Record<string, unknown>) => {
      if (onChange && Array.isArray(newData)) {
        const currentDf = dataframeRef.current;
        onChange({
          ...currentDf,
          data: newData.map(
            (row) => currentDf.columns?.map((col) => row[col.name]) || []
          )
        });
      }
    },
    [onChange]
  );

  const buildColumns = useCallback((): ColumnDefinition[] => {
    const cols = dataframeRef.current.columns;
    if (!cols) {return [];}
    return [
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
              cellClick: function (e: UIEvent, cell: CellComponent) {
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
      ...cols.map((col) => ({
        title: col.name,
        field: col.name,
        headerTooltip: col.data_type,
        editable: editable,
        resizable: true,
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
  }, [editable, showRowNumbers, showSelect]);

  // Initialize Tabulator once on mount
  useEffect(() => {
    if (!tableRef.current || tabulatorRef.current) {return;}

    const handleCellEdited = (cell: CellComponent) => {
      // Mark that we're doing an internal edit - don't clear history
      isInternalEditRef.current = true;
      
      const rownum = cell.getData().rownum;
      const currentDf = dataframeRef.current;
      const currentData = currentDf.data?.map((row, index) =>
        coerceRow(index, row, currentDf.columns || [])
      ) || [];
      
      onChangeRows(
        currentData.map((row, index) => {
          if (!row) {return {};}
          const newRow = { ...row };
          if (index === rownum) {
            newRow[cell.getField()] = cell.getValue();
          }
          return newRow;
        })
      );
      
      // Reset the flag after a short delay to allow React state to update
      setTimeout(() => {
        isInternalEditRef.current = false;
        updateHistoryState();
      }, 100);
    };

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: 200,
      data: data,
      columns: buildColumns(),
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
      movableRows: true,
      history: isModalMode // Enable undo/redo in modal mode
    });

    tabulatorInstance.on("cellEdited", handleCellEdited);
    tabulatorInstance.on("rowSelectionChanged", (_data, rows) => {
      setSelectedRows(rows);
    });
    tabulatorInstance.on("tableBuilt", () => {
      setIsTableReady(true);
    });
    
    tabulatorRef.current = tabulatorInstance;
    setTabulator(tabulatorInstance);

    return () => {
      tabulatorInstance.destroy();
      tabulatorRef.current = null;
      setIsTableReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data when it changes (without recreating tabulator)
  // Skip replaceData if the change came from Tabulator's own editing (to preserve history)
  useEffect(() => {
    if (isTableReady && tabulatorRef.current && !isInternalEditRef.current) {
      tabulatorRef.current.replaceData(data);
    }
  }, [data, isTableReady]);

  // Update columns when they change
  useEffect(() => {
    if (isTableReady && tabulatorRef.current) {
      tabulatorRef.current.setColumns(buildColumns());
    }
  }, [buildColumns, dataframe.columns, showSelect, showRowNumbers, isTableReady]);

  // Apply search filter
  useEffect(() => {
    if (isTableReady && tabulatorRef.current) {
      if (searchFilter && searchFilter.trim()) {
        // Filter across all columns
        const cols = dataframeRef.current.columns || [];
        const filters = cols.map((col) => ({
          field: col.name,
          type: "like" as const,
          value: searchFilter
        }));
        tabulatorRef.current.setFilter(filters as any);
      } else {
        (tabulatorRef.current.clearFilter as () => void)();
      }
    }
  }, [searchFilter, isTableReady]);

  return (
    <div className="datatable nowheel nodrag" css={tableStyles(theme)}>
      <TableActions
        tabulator={tabulator}
        data={data}
        selectedRows={selectedRows}
        showSelect={showSelect}
        setShowSelect={setShowSelect}
        showRowNumbers={showRowNumbers}
        setShowRowNumbers={setShowRowNumbers}
        editable={editable}
        dataframeColumns={dataframe.columns || []}
        onChangeRows={onChangeRows}
        isModalMode={isModalMode}
        canUndo={canUndo}
        canRedo={canRedo}
        onHistoryChange={updateHistoryState}
      />

      <div ref={tableRef} className="datatable" />
    </div>
  );
};

DataTable.displayName = "DataTable";

export default memo(DataTable, (prevProps, nextProps) => {
  // Deep comparison for dataframe object
  return (
    prevProps.editable === nextProps.editable &&
    prevProps.isModalMode === nextProps.isModalMode &&
    prevProps.searchFilter === nextProps.searchFilter &&
    isEqual(prevProps.dataframe, nextProps.dataframe)
  );
});
