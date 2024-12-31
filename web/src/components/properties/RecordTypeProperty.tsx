/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { ColumnDef } from "../../stores/ApiTypes";
import ColumnsManager from "../node/ColumnsManager";
import { Button, ButtonGroup } from "@mui/material";
// icons
import TableRowsIcon from "@mui/icons-material/TableRows";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      padding: "0",
      backgroundColor: "transparent"
    },
    ".button-group": {
      display: "flex",
      gap: "0.5em",
      marginBottom: "0.5em"
    },
    button: {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray2,
      border: 0,
      display: "flex",
      alignItems: "center",
      margin: 0,
      gap: "0.25em",
      padding: ".1em 1em 0 .5em",
      borderRadius: "0"
    },
    "button:hover": {
      color: theme.palette.c_white
    },
    "button svg": {
      fontSize: theme.fontSizeBig
    }
  });

const RecordTypeProperty = ({ value, onChange }: PropertyProps) => {
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

  return (
    <div css={styles}>
      <ButtonGroup className="button-group">
        <Button onClick={addColumn}>
          <TableRowsIcon style={{ rotate: "90deg" }} /> Add Column
        </Button>
      </ButtonGroup>
      <ColumnsManager
        columns={value.columns || []}
        onChange={onChangeColumns}
        allData={value.data || []}
      />
    </div>
  );
};

export default memo(RecordTypeProperty, isEqual);
