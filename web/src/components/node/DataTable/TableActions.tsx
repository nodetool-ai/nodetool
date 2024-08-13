import React from "react";
import {
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { ColumnDef } from "../../../stores/ApiTypes";

interface TableActionsProps {
  tabulator: Tabulator | undefined;
  data: any[] | Record<string, any>;
  selectedRows: any[];
  showSelect: boolean;
  setShowSelect: (show: boolean) => void;
  showRowNumbers?: boolean;
  setShowRowNumbers?: (show: boolean) => void;
  editable?: boolean;
  dataframeColumns?: ColumnDef[];
  onChangeRows: (newData: any[] | Record<string, any>) => void;
  isListTable?: boolean;
  showResetSortingButton?: boolean;
  showRowNumbersButton?: boolean;
}

const TableActions: React.FC<TableActionsProps> = ({
  tabulator,
  data,
  selectedRows,
  showSelect,
  setShowSelect,
  showRowNumbers,
  setShowRowNumbers,
  editable,
  dataframeColumns,
  onChangeRows,
  isListTable = false,
  showResetSortingButton: showSortingButton = true,
  showRowNumbersButton = true,
}) => {
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleCopyData = () => {
    let dataToStringify;
    if (isListTable) {
      dataToStringify = Array.isArray(data) ? data : Object.values(data);
    } else {
      dataToStringify = Array.isArray(data)
        ? data.map((row) => {
            const newRow = { ...row };
            delete newRow.rownum;
            return newRow;
          })
        : data;
    }
    writeClipboard(JSON.stringify(dataToStringify), true);
    addNotification({
      content: "Copied to clipboard",
      type: "success",
      alert: true,
    });
  };

  const handleAddRow = () => {
    if (isListTable) {
      if (Array.isArray(data)) {
        onChangeRows([...data, ""]);
      } else {
        const newKey = `new_key_${Object.keys(data).length}`;
        onChangeRows({ ...data, [newKey]: "" });
      }
    } else {
      if (Array.isArray(data) && dataframeColumns) {
        const newRow = defaultRow(dataframeColumns);
        onChangeRows([...data, newRow]);
      } else if (!Array.isArray(data)) {
        const newKey = `new_key_${Object.keys(data).length}`;
        onChangeRows({ ...data, [newKey]: "" });
      }
    }
  };

  const handleDeleteRows = () => {
    if (Array.isArray(data)) {
      onChangeRows(
        data.filter((_, index) => {
          return !selectedRows.some(
            (selectedRow) => selectedRow.getData().rownum === index
          );
        })
      );
    } else {
      const newData = { ...data };
      selectedRows.forEach((row) => {
        const key = row.getData().key;
        delete newData[key];
      });
      onChangeRows(newData);
    }
  };

  const handleResetSorting = () => {
    if (tabulator) {
      tabulator.clearSort();
    }
  };

  return (
    <div className="table-actions">
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

      {showSortingButton && (
        <Tooltip title="Reset table sorting">
          <Button variant="outlined" onClick={handleResetSorting}>
            Reset Sorting
          </Button>
        </Tooltip>
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

      {showRowNumbersButton && Array.isArray(data) && setShowRowNumbers && (
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
      )}

      <Tooltip title="Copy table data to clipboard">
        <Button variant="outlined" onClick={handleCopyData}>
          Copy Data
        </Button>
      </Tooltip>
    </div>
  );
};

export default TableActions;

const defaultRow = (columns: ColumnDef[]) => {
  return columns.reduce((acc, col) => {
    acc[col.name] = defaultValue(col);
    return acc;
  }, {} as Record<string, any>);
};

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
