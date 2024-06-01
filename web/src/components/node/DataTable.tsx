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
  Editor,
  Formatter
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { DataframeRef } from "../../stores/ApiTypes";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from "@mui/material";

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
    ".copy-button": {
      fontSize: theme.fontSizeTinyer,
      color: theme.palette.c_gray6,
      margin: "0",
      borderRadius: "0",
      padding: "0 .5em",
      border: 0,
      backgroundColor: theme.palette.c_gray0
    },
    ".copy-button:hover": {
      color: theme.palette.c_hl1
    },
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
      border: 0
    },
    ".select-column-toggle": {
      height: "2em",
      display: "flex",
      flexDirection: "column",
      gap: ".5em",
      padding: "0",
      margin: "0",
      "& .MuiToggleButton-root": {
        fontSize: theme.fontSizeTinyer,
        color: theme.palette.c_gray5,
        margin: "0",
        borderRadius: "0",
        border: 0,
        backgroundColor: theme.palette.c_gray0,
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
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [showSelect, setShowSelect] = useState(true);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
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
      ...(showSelect
        ? [
            {
              title: "",
              headerSort: false,
              resizable: false,
              frozen: true,
              headerHozAlign: "center" as ColumnDefinitionAlign,
              hozAlign: "center" as ColumnDefinitionAlign,
              formatter: "rowSelection" as Formatter,
              titleFormatter: "rowSelection" as Formatter,
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
        editor: "input" as Editor,
        headerHozAlign: "left" as ColumnDefinitionAlign
      }))
    ];
  }, [dataframe.columns, showRowNumbers, showSelect]);

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

  const handleDeleteRows = () => {
    if (tabulator) {
      tabulator.deleteRow(selectedRows);
      setSelectedRows([]);
    }
  };

  const handleResetSorting = () => {
    if (tabulator) {
      tabulator.clearSort();
    }
  };

  return (
    <div className="datatable nowheel nodrag" css={styles}>
      <div className="table-actions">
        <Tooltip title="Copy table data to clipboard">
          <Button
            className="copy-button"
            variant="outlined"
            onClick={handleClick}
          >
            Copy Data
          </Button>
        </Tooltip>

        <Tooltip title="Reset table sorting">
          <Button
            className="copy-button"
            variant="outlined"
            onClick={handleResetSorting}
          >
            Reset Sorting
          </Button>
        </Tooltip>

        <Tooltip title="Delete selected rows">
          <Button
            className={
              "copy-button" + (selectedRows.length > 0 ? "" : " disabled")
            }
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

        <Tooltip title="Show Select column">
          <ToggleButtonGroup
            className="select-column-toggle"
            value={showSelect ? "selected" : null}
            exclusive
            onChange={() => setShowSelect(!showSelect)}
          >
            <ToggleButton value="selected">Show Select</ToggleButton>
          </ToggleButtonGroup>
        </Tooltip>

        <Tooltip title="Show Row Numbers">
          <ToggleButtonGroup
            className="select-column-toggle"
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
