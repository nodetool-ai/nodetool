/** @jsxImportSource @emotion/react */
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback
} from "react";
import { css } from "@emotion/react";
import {
  TabulatorFull as Tabulator,
  ColumnDefinition,
  CellComponent,
  ColumnDefinitionAlign,
  Editor
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { DataframeRef } from "../../stores/ApiTypes";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Button } from "@mui/material";

const styles = (theme: any) =>
  css({
    "&.datatable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden"
    },
    ".tabulator": {
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1,
      height: "200px"
    },
    ".tabulator-col:hover": {
      backgroundColor: theme.palette.c_gray1
    },
    ".tabulator-tableholder": {
      overflow: "auto"
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
      }
  });

interface DataTableProps {
  dataframe: DataframeRef;
  onChange?: (data: DataframeRef) => void;
}

const DataTable: React.FC<DataTableProps> = ({ dataframe, onChange }) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tabulator, setTabulator] = useState<Tabulator>();
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const data = useMemo(() => {
    if (!dataframe.data || !dataframe.columns) return [];
    return dataframe.data.map((row) => {
      return dataframe.columns!.reduce(
        (acc: Record<string, any>, col, index) => {
          acc[col.name] = row[index];
          return acc;
        },
        {}
      );
    });
  }, [dataframe.columns, dataframe.data]);

  const columns = useMemo<ColumnDefinition[]>(() => {
    if (!dataframe.columns) return [];
    return [
      ...dataframe.columns.map((col) => ({
        title: col.name,
        field: col.name,
        editor: "input" as unknown as Editor,
        headerHozAlign: "center" as ColumnDefinitionAlign
      }))
    ];
  }, [dataframe.columns]);

  const onCellEdited = useCallback(
    (cell: CellComponent) => {
      const newData = data.map((row, index) => {
        if (!row) {
          return {};
        }
        const newRow =
          dataframe.columns?.reduce((acc, col) => {
            acc[col.name] = row[col.name];
            return acc;
          }, {} as Record<string, any>) || {};
        if (index === cell.getRow().getIndex()) {
          newRow[cell.getField()] = cell.getValue();
        }
        return newRow;
      });
      if (onChange) {
        onChange({
          ...dataframe,
          data: newData.map(
            (row) => dataframe.columns?.map((col) => row[col.name]) || []
          )
        });
      }
    },
    [data, dataframe, onChange]
  );

  useEffect(() => {
    if (!tableRef.current) return;

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "300px",
      data: data,
      columns: columns,
      rowHeader: {
        field: "_id",
        hozAlign: "center",
        formatter: "rownum",
        headerSort: false
        // frozen: true
      },
      columnDefaults: {
        headerSort: true,
        hozAlign: "left",
        headerHozAlign: "left",
        editor: "input",
        resizable: true,
        editorParams: {
          elementAttributes: { spellcheck: "false" }
        }
      }
    });

    tabulatorInstance.on("cellEdited", onCellEdited);

    setTabulator(tabulatorInstance);

    return () => {
      tabulatorInstance.destroy();
    };
  }, [data, columns, onCellEdited]);

  const handleClick = () => {
    if (tabulator) {
      writeClipboard(JSON.stringify(tabulator.getData()), true);
      addNotification({
        content: "Copied to clipboard",
        type: "success",
        alert: true
      });
    }
  };

  return (
    <div className="datatable nowheel nodrag" css={styles}>
      <Button onClick={handleClick}>Copy to Clipboard</Button>
      <div ref={tableRef} className="datatable" />
    </div>
  );
};

export default DataTable;
