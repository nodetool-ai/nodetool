/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { memo, useCallback } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { ColumnDef } from "../../stores/ApiTypes";
import ColumnsManager from "../node/ColumnsManager";
import { Button, ButtonGroup } from "@mui/material";
// icons
import TableRowsIcon from "@mui/icons-material/TableRows";
import isEqual from "lodash/isEqual";

const styles = (theme: Theme) =>
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
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[100],
      backgroundColor: theme.vars.palette.grey[600],
      border: 0,
      display: "flex",
      alignItems: "center",
      margin: 0,
      gap: "0.25em",
      padding: ".1em 1em 0 .5em",
      borderRadius: "4px"
    },
    "button:hover": {
      color: theme.vars.palette.grey[0]
    },
    "button svg": {
      fontSize: theme.fontSizeSmall
    }
  });

const RecordTypeProperty = ({ value, onChange }: PropertyProps) => {
  const theme = useTheme();
  if (value === undefined) {
    value = {
      columns: [],
      data: []
    };
  }
  const onChangeColumns = useCallback(
    (columns: ColumnDef[]) => {
      onChange({
        type: "record_type",
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
      type: "record_type",
      ...value,
      columns: [...columns, newColumn]
    });
  }, [onChange, value]);

  return (
    <div css={styles(theme)}>
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
