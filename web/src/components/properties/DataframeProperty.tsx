/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState, DragEvent } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { ColumnDef, DataframeRef } from "../../stores/ApiTypes";
import DataTable from "../node/DataTable/DataTable";
import ColumnsManager from "../node/ColumnsManager";
import DataframeEditorModal from "./DataframeEditorModal";
import { Button, ButtonGroup, IconButton, Tooltip } from "@mui/material";
// icons
import TableRowsIcon from "@mui/icons-material/TableRows";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import isEqual from "lodash/isEqual";
import {
  parseDataframeFile,
  isSupportedDataframeFile
} from "../../utils/dataframeParsers";
import { useNotificationStore } from "../../stores/NotificationStore";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
    padding: "0",
    marginBottom: "0.5em",
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
    ".property-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "relative"
    },
    ".dataframe-action-buttons": {
      position: "absolute",
      right: "1.5em",
      top: "-2px",
      zIndex: 10
    },
    ".dataframe-action-buttons .MuiIconButton-root": {
      margin: "0 0 0 5px",
      padding: "0.2em",
      color: theme.vars.palette.primary.main,
      "&:hover": {
        color: theme.vars.palette.primary.light,
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)`
      }
    },
    ".dataframe-action-buttons .MuiIconButton-root svg": {
      fontSize: "1rem"
    },
    ".button-group": {
      display: "flex",
      marginBottom: "0.5em"
    },
    ".button-group button": {
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily2,
      wordSpacing: "-0.1em",
      backgroundColor: theme.vars.palette.grey[600],
      border: 0,
      color: theme.vars.palette.grey[100] + " !important",
      display: "flex",
      alignItems: "center",
      margin: 0,
      gap: "0.25em",
      padding: ".1em 1em 0 .5em",
      borderRadius: "0"
    },
    "button.add-column:hover": {
      color: theme.vars.palette.grey[0] + " !important"
    },
    "button.add-column svg": {
      fontSize: theme.fontSizeSmall,
      marginRight: "0.5em"
    },
    ".dropzone": {
      position: "relative",
      minHeight: "50px",
      width: "100%",
      border: "0",
      textAlign: "center",
      transition: "all 0.2s ease",
      outline: `1px dashed ${theme.vars.palette.grey[600]}`,
      margin: "5px 0",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      "&:hover": {
        outline: `1px dashed ${theme.vars.palette.grey[400]}`,
        backgroundColor: "rgba(0, 0, 0, 0.3)"
      },
      "&.drag-over": {
        backgroundColor: theme.vars.palette.grey[600],
        outline: `2px dashed ${theme.vars.palette.grey[100]}`,
        outlineOffset: "-2px"
      }
    },
    ".dropzone-content": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      padding: "1em"
    },
    ".dropzone-content svg": {
      fontSize: "1.5rem",
      color: theme.vars.palette.grey[400]
    },
    ".dropzone-text": {
      fontSize: theme.fontSizeTiny,
      fontFamily: theme.fontFamily2,
      textTransform: "uppercase",
      letterSpacing: "1px",
      color: theme.vars.palette.grey[500],
      lineHeight: "1.2"
    },
    ".dropzone-subtext": {
      fontSize: "10px",
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[600]
    }
  });

const DataframeProperty = ({
  value,
  onChange,
  nodeType: _nodeType,
  property,
  propertyIndex
}: PropertyProps) => {
  const theme = useTheme();
  const _id = `${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        // Notify all other dataframe modals to close themselves
        window.dispatchEvent(new Event("close-dataframe-editor-modal"));
      }
      return next;
    });
  }, []);

  const onCellChange = useCallback(
    (df: DataframeRef) => {
      onChange(df);
    },
    [onChange]
  );

  const onChangeColumns = useCallback(
    (columns: ColumnDef[]) => {
      onChange({
        ...value,
        columns
      });
    },
    [value, onChange]
  );

  const addColumn = useCallback(() => {
    const columns = value.columns || [];
    let newColumnName = "Column 1";
    let counter = 1;
    while (columns.find((col: ColumnDef) => col.name === newColumnName)) {
      newColumnName = `Column ${counter}`;
      counter++;
    }
    const newColumn: ColumnDef = {
      name: newColumnName,
      data_type: "string",
      description: ""
    };
    onChange({
      ...value,
      columns: [...columns, newColumn]
    });
  }, [onChange, value]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length === 0) {
        return;
      }

      const file = files[0];

      if (!isSupportedDataframeFile(file)) {
        addNotification({
          type: "error",
          alert: true,
          content:
            "Invalid file type. Please drop a CSV, XLSX, or XLS file."
        });
        return;
      }

      setIsLoading(true);
      try {
        const dataframe = await parseDataframeFile(file);
        onChange(dataframe);
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      } finally {
        setIsLoading(false);
      }
    },
    [onChange, addNotification]
  );

  // Check if dataframe has data
  const hasData =
    (value.columns && value.columns.length > 0) ||
    (value.data && value.data.length > 0);

  return (
    <div
      className="dataframe-editor"
      css={styles(theme)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="property-header">
        <ButtonGroup className="button-group">
          <Button className="add-column" onClick={addColumn}>
            <TableRowsIcon style={{ rotate: "90deg" }} /> Add Column
          </Button>
        </ButtonGroup>
        {isHovered && (
          <div className="dataframe-action-buttons">
            <Tooltip title="Open Editor" placement="bottom">
              <IconButton size="small" onClick={toggleExpand} aria-label="Open dataframe editor">
                <OpenInFullIcon />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Drop zone for CSV/Excel files */}
      <div
        className={`dropzone ${isDragOver ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone-content">
          <UploadFileIcon />
          <span className="dropzone-text">
            {isLoading ? "Loading..." : "Drop CSV or Excel file"}
          </span>
          <span className="dropzone-subtext">Supported: CSV, XLSX, XLS</span>
        </div>
      </div>

      {hasData && (
        <>
          <ColumnsManager
            columns={value.columns || []}
            onChange={onChangeColumns}
            allData={value.data || []}
          />
          <DataTable
            dataframe={value}
            onChange={onCellChange}
            editable={true}
          />
        </>
      )}

      {isExpanded && (
        <DataframeEditorModal
          value={value}
          onChange={onChange}
          onClose={toggleExpand}
          propertyName={property.name}
          propertyDescription={property.description ?? undefined}
        />
      )}
    </div>
  );
};

export default memo(DataframeProperty, isEqual);
