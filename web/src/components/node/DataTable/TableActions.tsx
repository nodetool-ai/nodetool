import React, { useCallback, memo } from "react";
import { Tooltip, IconButton, Divider } from "@mui/material";
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
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

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
  isModalMode?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onHistoryChange?: () => void;
}

const TableActions: React.FC<TableActionsProps> = memo(({
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
  isModalMode = false,
  canUndo = false,
  canRedo = false,
  onHistoryChange
}) => {
  TableActions.displayName = 'TableActions';
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
      alert: true
    });
  };

  const handleAddRow = () => {
    const shouldTreatAsList = isListTable || !dataframeColumns;
    if (shouldTreatAsList) {
      if (Array.isArray(data)) {
        let defaultValue: any = "";

        // If we have existing data, try to match its type
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
          // Use the data_type from columns if available
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
  };

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

  const handleDeleteRowsClick = useCallback(() => {
    if (tabulator?.getSelectedRows().length) {
      handleDeleteRows();
    }
  }, [tabulator, handleDeleteRows]);

  const handleToggleSelect = useCallback(() => {
    setShowSelect(!showSelect);
  }, [setShowSelect, showSelect]);

  const handleToggleRowNumbers = useCallback(() => {
    setShowRowNumbers?.(!showRowNumbers);
  }, [setShowRowNumbers, showRowNumbers]);

  // Duplicate selected rows
  const handleDuplicateRows = useCallback(() => {
    if (!Array.isArray(data) || selectedRows.length === 0) {return;}
    
    const duplicatedRows = selectedRows.map((row) => {
      const rowData = { ...row.getData() };
      delete rowData.rownum; // Remove rownum, will be reassigned
      return rowData;
    });
    
    // Insert after the last selected row
    const lastSelectedIndex = Math.max(...selectedRows.map((r) => r.getData().rownum));
    const newData = [...data];
    newData.splice(lastSelectedIndex + 1, 0, ...duplicatedRows);
    
    // Reassign rownums
    const reindexedData = newData.map((row, index) => ({ ...row, rownum: index }));
    onChangeRows(reindexedData);
    
    addNotification({
      content: `Duplicated ${duplicatedRows.length} row(s)`,
      type: "success",
      alert: true
    });
  }, [data, selectedRows, onChangeRows, addNotification]);

  // Undo action
  const handleUndo = useCallback(() => {
    if (tabulator) {
      tabulator.undo();
      onHistoryChange?.();
    }
  }, [tabulator, onHistoryChange]);

  // Redo action
  const handleRedo = useCallback(() => {
    if (tabulator) {
      tabulator.redo();
      onHistoryChange?.();
    }
  }, [tabulator, onHistoryChange]);

  // Parse CSV line handling quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Paste from clipboard
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        addNotification({
          content: "Clipboard is empty",
          type: "warning",
          alert: true
        });
        return;
      }
      
      // Parse lines
      const lines = text.trim().split(/\r?\n/);
      const rows = lines.map((line) => parseCSVLine(line));
      
      if (rows.length === 0) {return;}
      
      // Map to column structure
      if (Array.isArray(data) && dataframeColumns && dataframeColumns.length > 0) {
        const colNames = dataframeColumns.map((c) => c.name.toLowerCase());
        
        // Check if first row is a header row (matches column names)
        const firstRow = rows[0].map((c) => c.toLowerCase().replace(/^"|"$/g, ""));
        const matchingHeaders = firstRow.filter((h) => colNames.includes(h));
        const hasHeaderRow = matchingHeaders.length >= Math.min(2, dataframeColumns.length);
        
        // Build column index mapping
        const columnMapping: Map<number, number> = new Map(); // pasted index -> dataframe column index
        
        if (hasHeaderRow) {
          // Map by header name
          firstRow.forEach((header, pasteIdx) => {
            const dfIdx = colNames.indexOf(header);
            if (dfIdx !== -1) {
              columnMapping.set(pasteIdx, dfIdx);
            }
          });
        } else {
          // Map by position (skip empty leading columns that might be select/rownum)
          let firstNonEmptyIdx = 0;
          if (rows.length > 0) {
            // Find where actual data starts (skip empty columns)
            for (let i = 0; i < rows[0].length; i++) {
              if (rows[0][i] !== "") {
                firstNonEmptyIdx = i;
                break;
              }
            }
          }
          dataframeColumns.forEach((_, dfIdx) => {
            columnMapping.set(firstNonEmptyIdx + dfIdx, dfIdx);
          });
        }
        
        // Parse data rows (skip header if present)
        const dataRows = hasHeaderRow ? rows.slice(1) : rows;
        
        const newRows = dataRows.map((row) => {
          const newRow: Record<string, any> = {};
          dataframeColumns.forEach((col, dfIdx) => {
            // Find which paste column maps to this dataframe column
            let value: any = "";
            for (const [pasteIdx, mappedDfIdx] of columnMapping.entries()) {
              if (mappedDfIdx === dfIdx) {
                value = row[pasteIdx] ?? "";
                // Remove surrounding quotes
                if (typeof value === "string") {
                  value = value.replace(/^"|"$/g, "");
                }
                break;
              }
            }
            // Coerce to correct type
            if (col.data_type === "int") {
              value = parseInt(value) || 0;
            } else if (col.data_type === "float") {
              value = parseFloat(value) || 0.0;
            }
            newRow[col.name] = value;
          });
          return newRow;
        });
        
        if (newRows.length === 0) {
          addNotification({
            content: "No data rows to paste",
            type: "warning",
            alert: true
          });
          return;
        }
        
        // Insert at selection point or append to end
        const insertIndex = selectedRows.length > 0 
          ? Math.max(...selectedRows.map((r) => r.getData().rownum)) + 1
          : data.length;
        
        const newData = [...data];
        newData.splice(insertIndex, 0, ...newRows);
        
        // Reassign rownums
        const reindexedData = newData.map((row, index) => ({ ...row, rownum: index }));
        onChangeRows(reindexedData);
        
        addNotification({
          content: `Pasted ${newRows.length} row(s)`,
          type: "success",
          alert: true
        });
      }
    } catch (_error) {
      addNotification({
        content: "Failed to paste from clipboard",
        type: "error",
        alert: true
      });
    }
  }, [data, dataframeColumns, selectedRows, onChangeRows, addNotification]);

  // Export CSV - exclude select and rownum columns
  const handleExportCSV = useCallback(() => {
    if (!dataframeColumns || !Array.isArray(data)) {return;}
    
    // Build CSV content manually to exclude utility columns
    const headers = dataframeColumns.map((c) => `"${c.name}"`).join(",");
    const rows = data.map((row) => {
      return dataframeColumns.map((col) => {
        const value = row[col.name];
        // Escape quotes and wrap in quotes
        const strValue = String(value ?? "").replace(/"/g, '""');
        return `"${strValue}"`;
      }).join(",");
    });
    
    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dataframe.csv";
    link.click();
    URL.revokeObjectURL(url);
    
    addNotification({
      content: "Exported as CSV",
      type: "success",
      alert: true
    });
  }, [data, dataframeColumns, addNotification]);

  // Export JSON - exclude select and rownum columns
  const _handleExportJSON = useCallback(() => {
    if (!dataframeColumns || !Array.isArray(data)) {return;}
    
    // Build clean data without utility columns
    const cleanData = data.map((row) => {
      const cleanRow: Record<string, any> = {};
      dataframeColumns.forEach((col) => {
        cleanRow[col.name] = row[col.name];
      });
      return cleanRow;
    });
    
    const jsonContent = JSON.stringify(cleanData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dataframe.json";
    link.click();
    URL.revokeObjectURL(url);
    
    addNotification({
      content: "Exported as JSON",
      type: "success",
      alert: true
    });
  }, [data, dataframeColumns, addNotification]);

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
              onClick={handleDeleteRowsClick}
            >
              <DeleteIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>

          {isModalMode && (
            <Tooltip title="Duplicate selected rows">
              <IconButton
                className={
                  tabulator?.getSelectedRows().length === 0 ? "disabled" : ""
                }
                onClick={handleDuplicateRows}
              >
                <FileCopyIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}

      {showSortingButton && (
        <Tooltip title="Reset table sorting">
          <IconButton onClick={handleResetSorting}>
            <RestartAltIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      )}

      {isModalMode && editable && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton 
                onClick={handleUndo} 
                disabled={!canUndo}
                className={!canUndo ? "disabled" : ""}
              >
                <UndoIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton 
                onClick={handleRedo}
                disabled={!canRedo}
                className={!canRedo ? "disabled" : ""}
              >
                <RedoIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Paste from clipboard">
            <IconButton onClick={handlePaste}>
              <ContentPasteIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </>
      )}

      {isModalMode && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Export as CSV">
            <IconButton onClick={handleExportCSV}>
              <FileDownloadIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </>
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
});

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
