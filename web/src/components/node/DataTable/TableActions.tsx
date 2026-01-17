import React, { useCallback } from "react";
import { Tooltip, IconButton } from "@mui/material";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { ColumnDef } from "../../../stores/ApiTypes";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import NumbersIcon from "@mui/icons-material/Numbers";

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
  showRowNumbersButton = true
}) => {
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleCopyData = useCallback(() => {
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
      alert: true
    });
  }, [data, isListTable, writeClipboard, addNotification]);

  const handleAddRow = useCallback(() => {
    const shouldTreatAsList = isListTable || !dataframeColumns;
    if (shouldTreatAsList) {
      if (Array.isArray(data)) {
        let defaultValue: any = "";

        if (data.length > 0) {
          const firstItem = data[0];
          if (typeof firstItem === "number") {
            defaultValue = 0;
          } else if (typeof firstItem === "string") {
            defaultValue = "";
          } else {
            defaultValue = "";
          }
        } else if (dataframeColumns?.[0]?.data_type) {
          switch (dataframeColumns[0].data_type) {
            case "int":
              defaultValue = 0;
              break;
            case "float":
              defaultValue = 0.0;
              break;
            case "datetime":
              defaultValue = "";
              break;
            default:
              defaultValue = "";
          }
        }
        onChangeRows([...data, defaultValue]);
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
  }, [data, isListTable, dataframeColumns, onChangeRows]);

  const handleDeleteRows = useCallback(() => {
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
  }, [data, selectedRows, onChangeRows]);

  const handleResetSorting = useCallback(() => {
    if (tabulator) {
      tabulator.clearSort();
    }
  }, [tabulator]);

  const handleDeleteClick = useCallback(() => {
    if (tabulator?.getSelectedRows().length) {
      handleDeleteRows();
    }
  }, [tabulator, handleDeleteRows]);

  const handleToggleSelect = useCallback(() => {
    setShowSelect(!showSelect);
  }, [setShowSelect, showSelect]);

  const handleToggleRowNumbers = useCallback(() => {
    if (setShowRowNumbers) {
      setShowRowNumbers(!showRowNumbers);
    }
  }, [setShowRowNumbers, showRowNumbers]);

  return (
    <div className="table-actions">
      {editable && (
        <>
          <Tooltip title="Add new row">
            <IconButton onClick={handleAddRow}>
              <AddIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Delete selected rows">
            <IconButton
              className={
                tabulator?.getSelectedRows().length === 0 ? "disabled" : ""
              }
              onClick={handleDeleteClick}
            >
              <DeleteIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </>
      )}

      {showSortingButton && (
        <Tooltip title="Reset table sorting">
          <IconButton onClick={handleResetSorting}>
            <RestartAltIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title="Show Select column">
        <IconButton
          onClick={handleToggleSelect}
          color={showSelect ? "primary" : "default"}
        >
          <CheckBoxIcon sx={{ fontSize: 12 }} />
        </IconButton>
      </Tooltip>

      {showRowNumbersButton && Array.isArray(data) && setShowRowNumbers && (
        <Tooltip title="Show Row Numbers">
          <IconButton
            onClick={handleToggleRowNumbers}
            color={showRowNumbers ? "primary" : "default"}
          >
            <NumbersIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title="Copy table data to clipboard">
        <IconButton onClick={handleCopyData}>
          <ContentCopyIcon sx={{ fontSize: 12 }} />
        </IconButton>
      </Tooltip>
    </div>
  );
};

export default React.memo(TableActions);

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
