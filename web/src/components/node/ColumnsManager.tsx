/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useEffect, useRef, memo } from "react";
import {
  Grid,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Button
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { devWarn } from "../../utils/DevLog";
import { ColumnDef } from "../../stores/ApiTypes";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      gap: ".25em",
      padding: "0",
      backgroundColor: "transparent",
      fontFamily: theme.fontFamily
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
    ".label-name": {
      flexGrow: 1,
      width: "35%"
    },
    ".label-description": {
      flexGrow: 1,
      width: "35%"
    },
    ".label-datatype": {
      width: "30%",
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
    ".item-name": {
      flexGrow: 1,
      width: "35%"
    },
    ".item-description": {
      flexGrow: 1,
      width: "35%"
    },
    ".item-datatype": {
      flexGrow: 0,
      width: "30%",
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
      },
      "& svg": {
        width: ".7em",
        height: ".7em"
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

const Column = memo(
  ({
    index,
    field,
    inputRef,
    handleNameChange,
    handleDataTypeChange,
    handleDescriptionChange,
    removeColumn,
    validDataTypes
  }: {
    index: number;
    field: ColumnDef;
    inputRef: (el: HTMLInputElement | null) => void;
    handleNameChange: (index: number, newName: string) => void;
    handleDataTypeChange: (index: number, newType: string) => void;
    handleDescriptionChange: (index: number, newDescription: string) => void;
    removeColumn: (index: number) => void;
    validDataTypes: string[];
  }) => (
    <div className="column" key={index}>
      <div className="item-name">
        <TextField
          inputRef={inputRef}
          className="textfield"
          margin="dense"
          value={field.name}
          onChange={(e) => handleNameChange(index, e.target.value)}
        />
      </div>
      <div className="item-description">
        <TextField
          className="textfield"
          margin="dense"
          value={field.description}
          onChange={(e) => handleDescriptionChange(index, e.target.value)}
        />
      </div>

      <div className="item-datatype">
        <Select
          labelId={`${field}-${index}-type`}
          value={field.data_type}
          onChange={(e) => handleDataTypeChange(index, e.target.value)}
          variant="standard"
          className="mui-select nodrag"
          disableUnderline={true}
          MenuProps={{
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "left"
            },
            transformOrigin: {
              vertical: "top",
              horizontal: "left"
            }
          }}
        >
          {validDataTypes.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </Select>

        <Button className="delete" onClick={() => removeColumn(index)}>
          <CloseIcon />
        </Button>
      </div>
    </div>
  )
);
Column.displayName = "Column";

const ColumnsManager = ({
  columns,
  allData,
  onChange
}: ColumnsManagerProps) => {
  const [localColumns, setLocalColumns] = useState(columns);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  const handleNameChange = (index: number, newName: string) => {
    if (
      newName.trim() === "" ||
      localColumns.some((col) => col.name === newName)
    ) {
      devWarn(
        "Invalid column name. Column names must be unique and non-empty."
      );
    }
    const newColumns = localColumns.map((col, i) =>
      i === index ? { ...col, name: newName } : col
    );

    const oldName = columns[index].name;
    const newData = allData.map((row) => {
      const newRow = { ...row };
      if (newName !== oldName && oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });

    setLocalColumns(newColumns);
    onChange(newColumns, newData);

    setTimeout(() => {
      inputRefs.current[index]?.focus();
    }, 0);
  };

  const validDataTypes = ["string", "float", "int", "datetime"];

  const handleDescriptionChange = (index: number, newDescription: string) => {
    const newColumns = localColumns.map((col, i) =>
      i === index ? { ...col, description: newDescription } : col
    );

    setLocalColumns(newColumns);
    onChange(newColumns, allData);
  };

  const handleDataTypeChange = (index: number, newType: string) => {
    if (!validDataTypes.includes(newType)) {
      return;
    }
    const validatedType = newType as "string" | "float" | "int" | "datetime";

    const newColumns = localColumns.map((col, i) =>
      i === index ? { ...col, data_type: validatedType } : col
    );

    setLocalColumns(newColumns);
    onChange(newColumns, allData);
  };

  const removeColumn = (index: number) => {
    if (index < 0 || index >= localColumns.length) {
      devWarn("Attempted to remove a column with an invalid index.");
      return;
    }

    const newColumns = localColumns.filter((_, i) => i !== index);
    const newData = allData.map((row) => {
      const newRow = { ...row };
      delete newRow[localColumns[index].name];
      return newRow;
    });

    setLocalColumns(newColumns);
    onChange(newColumns, newData);
  };

  return (
    <Grid container spacing={0} css={styles}>
      <div className="labels">
        <InputLabel className="label-name">Name</InputLabel>
        <InputLabel className="label-description">Description</InputLabel>
        <InputLabel className="label-datatype">Data Type</InputLabel>
      </div>
      {localColumns.map((field, index) => (
        <Column
          key={index}
          index={index}
          field={field}
          inputRef={(el) => (inputRefs.current[index] = el)}
          handleNameChange={handleNameChange}
          handleDataTypeChange={handleDataTypeChange}
          handleDescriptionChange={handleDescriptionChange}
          removeColumn={removeColumn}
          validDataTypes={validDataTypes}
        />
      ))}
    </Grid>
  );
};

export default ColumnsManager;
