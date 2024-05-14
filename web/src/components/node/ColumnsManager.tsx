/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import {
  Grid,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Button
} from "@mui/material";
import { ColumnDef } from "../../stores/ApiTypes";
import CloseIcon from "@mui/icons-material/Close";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      gap: ".25em",
      padding: "0",
      backgroundColor: "transparent"
    },
    ".labels": {
      display: "flex",
      flexDirection: "row",
      gap: 0,
      width: "100%",
      justifyContent: "space-between",
      padding: "0",
      margin: "0"
    },
    ".label-left": {
      flexGrow: 1
    },
    ".label-right": {
      width: "35%",
      flexGrow: 0
    },
    ".column": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: "0.5em",
      padding: "0",
      margin: "0",
      width: "100%"
    },
    ".item-left": {
      flexGrow: 1
    },
    ".item-right": {
      flexGrow: 0,
      width: "35%",
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      alignItems: "center"
    },
    ".textfield": {
      margin: "0",
      padding: ".5em 0",
      height: "2em"
    },
    ".textfield .MuiInputBase-root": {
      borderRadius: "0"
    },
    ".textfield input": {
      margin: "0",
      padding: "0 .5em .25em .5em",
      height: "1em",
      fontSize: theme.fontSizeSmaller
    },
    ".select": {
      margin: "0",
      padding: "0",
      border: 0,
      borderRadius: "0"
    },
    ".select .MuiSelect-select": {
      borderRadius: "0",
      height: "2em",
      margin: "0"
    },
    ".select svg": {
      right: "0"
    },
    ".select fieldset": {
      border: "0"
    },
    ".delete": {
      margin: "0",
      padding: "0",
      width: "1em",
      minWidth: "1em",
      height: "1em",
      borderRadius: "0",
      backgroundColor: "transparent",
      color: theme.palette.c_gray4,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        color: theme.palette.c_delete
      }
    }
  });
interface ColumnsManagerProps {
  columns: ColumnDef[];
  allData: { [key: string]: any }[];
  onChange: (
    newColumns: ColumnDef[],
    newData: { [key: string]: any }[]
  ) => void;
}

const ColumnsManager = ({
  columns,
  allData,
  onChange
}: ColumnsManagerProps) => {
  const handleNameChange = (index: number, newName: string) => {
    const newColumns = columns.map((col, i) =>
      i === index ? { ...col, name: newName } : col
    );
    const newData = allData.map((row) => {
      const newRow = { ...row };
      const oldName = columns[index].name;
      if (newName !== oldName) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
    onChange(newColumns, newData);
  };

  const validDataTypes = ["object", "float", "int", "datetime"];

  const handleDataTypeChange = (index: number, newType: string) => {
    if (!validDataTypes.includes(newType)) {
      return;
    }
    const validatedType = newType as "object" | "float" | "int" | "datetime";

    const newColumns = columns.map((col, i) =>
      i === index ? { ...col, data_type: validatedType } : col
    );
    onChange(newColumns, allData);
  };

  const removeColumn = (index: number) => {
    const newColumns = columns.filter((_, i) => i !== index);
    const newData = allData.map((row) => {
      const newRow = { ...row };
      delete newRow[columns[index].name];
      return newRow;
    });
    onChange(newColumns, newData);
  };
  return (
    <Grid container spacing={0} css={styles}>
      <div className="labels">
        <InputLabel className="label-left">Column Name</InputLabel>
        <InputLabel className="label-right">Data Type</InputLabel>
      </div>
      {columns.map((field, index) => (
        <div className="column" key={field.name + index}>
          <div className="item-left">
            <TextField
              className="textfield"
              margin="dense"
              value={field.name}
              onChange={(e) => handleNameChange(index, e.target.value)}
            />
          </div>

          <div className="item-right">
            <Select
              className="select"
              labelId={`${field}-${index}-type`}
              value={field.data_type}
              onChange={(e) => handleDataTypeChange(index, e.target.value)}
            >
              <MenuItem value="object">object</MenuItem>
              <MenuItem value="float">float</MenuItem>
              <MenuItem value="int">int</MenuItem>
            </Select>
            <Button className="delete" onClick={() => removeColumn(index)}>
              <CloseIcon />
            </Button>
          </div>
        </div>
      ))}
    </Grid>
  );
};

export default ColumnsManager;
