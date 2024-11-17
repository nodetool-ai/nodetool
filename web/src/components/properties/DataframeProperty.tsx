/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { ColumnDef, DataframeRef } from "../../stores/ApiTypes";
import DataTable from "../node/DataTable/DataTable";
import PropertyLabel from "../node/PropertyLabel";
import ColumnsManager from "../node/ColumnsManager";
import { Button, ButtonGroup } from "@mui/material";
// icons
import TableRowsIcon from "@mui/icons-material/TableRows";
import { tableStyles } from "../../styles/TableStyles";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css([
    {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      padding: "0",
      marginBottom: "0.5em",
      backgroundColor: "transparent",
      ".button-group": {
        display: "flex",
        marginBottom: "0.5em"
      },
      ".button-group button": {
        fontSize: theme.fontSizeSmall,
        fontFamily: theme.fontFamily2,
        wordSpacing: "-0.1em",
        backgroundColor: theme.palette.c_gray2,
        border: 0,
        color: theme.palette.c_gray6 + " !important",
        display: "flex",
        alignItems: "center",
        margin: 0,
        gap: "0.25em",
        padding: ".1em 1em 0 .5em",
        borderRadius: "0"
      },
      "button.add-column:hover": {
        color: theme.palette.c_white + " !important"
      },
      "button.add-column svg": {
        fontSize: theme.fontSizeSmall,
        marginRight: "0.5em"
      }
    },
    tableStyles(theme)
  ]);

const DataframeProperty = ({
  value,
  onChange,
  nodeType,
  property,
  propertyIndex
}: PropertyProps) => {
  const id = `${property.name}-${propertyIndex}`;

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
    while (columns.find((col: any) => col.name === newColumnName)) {
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
      <div className="dataframe-editor" css={styles}>
        <ButtonGroup className="button-group">
          <Button className="add-column" onClick={addColumn}>
            <TableRowsIcon style={{ rotate: "90deg" }} /> Add Column
          </Button>
        </ButtonGroup>
        <ColumnsManager
          columns={value.columns || []}
          onChange={onChangeColumns}
          allData={value.data || []}
        />
        <DataTable dataframe={value} onChange={onCellChange} editable={true} />
      </div>
    );
  } else {
    return (
      <>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
      </>
    );
  }
};

export default memo(DataframeProperty, isEqual);
