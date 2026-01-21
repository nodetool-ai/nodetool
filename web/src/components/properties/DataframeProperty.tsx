/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { ColumnDef, DataframeRef } from "../../stores/ApiTypes";
import DataTable from "../node/DataTable/DataTable";
import PropertyLabel from "../node/PropertyLabel";
import ColumnsManager from "../node/ColumnsManager";
import DataframeEditorModal from "./DataframeEditorModal";
import { Button, ButtonGroup, IconButton, Tooltip } from "@mui/material";
// icons
import TableRowsIcon from "@mui/icons-material/TableRows";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import isEqual from "lodash/isEqual";

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
    }
  });

const DataframeProperty = ({
  value,
  onChange,
  nodeType,
  property,
  propertyIndex
}: PropertyProps) => {
  const theme = useTheme();
  const id = `${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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

  if (nodeType === "nodetool.constant.DataFrame") {
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
                <IconButton size="small" onClick={toggleExpand}>
                  <OpenInFullIcon />
                </IconButton>
              </Tooltip>
            </div>
          )}
        </div>
        <ColumnsManager
          columns={value.columns || []}
          onChange={onChangeColumns}
          allData={value.data || []}
        />
        <DataTable dataframe={value} onChange={onCellChange} editable={true} />
        {isExpanded && (
          <DataframeEditorModal
            value={value}
            onChange={onChange}
            onClose={toggleExpand}
            propertyName={property.name}
            propertyDescription={property.description}
          />
        )}
      </div>
    );
  } else {
    return (
      <div
        className="dataframe-property"
        css={styles(theme)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="property-header">
          <PropertyLabel
            name={property.name}
            description={property.description}
            id={id}
          />
          {isHovered && (
            <div className="dataframe-action-buttons">
              <Tooltip title="Open Editor" placement="bottom">
                <IconButton size="small" onClick={toggleExpand}>
                  <OpenInFullIcon />
                </IconButton>
              </Tooltip>
            </div>
          )}
        </div>
        {isExpanded && (
          <DataframeEditorModal
            value={value}
            onChange={onChange}
            onClose={toggleExpand}
            propertyName={property.name}
            propertyDescription={property.description}
          />
        )}
      </div>
    );
  }
};

export default memo(DataframeProperty, isEqual);
