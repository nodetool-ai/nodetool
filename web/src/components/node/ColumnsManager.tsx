/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useEffect, useRef, memo } from "react";
import { Grid, InputLabel } from "@mui/material";
import log from "loglevel";
import { ColumnDef } from "../../stores/ApiTypes";
import isEqual from "lodash/isEqual";
import Column from "./Column";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      gap: "0.15em",
      padding: "0",
      backgroundColor: "transparent"
    },
    ".labels": {
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      width: "100%",
      padding: "0 0 0.15em 0",
      margin: "0",
      alignItems: "center"
    },
    ".label-name": {
      flexGrow: 1,
      flexBasis: 0,
      fontSize: "0.75rem",
      color: theme.vars.palette.grey[400]
    },
    ".label-description": {
      flexGrow: 1,
      flexBasis: 0
    },
    ".label-datatype": {
      width: "auto",
      minWidth: "70px",
      flexGrow: 0,
      fontSize: "0.75rem",
      color: theme.vars.palette.grey[400],
      marginRight: "1.5em" // Account for delete button width
    },
    ".column": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "0.5em",
      padding: "0",
      margin: "0 0 0.15em 0",
      width: "100%"
    },
    ".item-name": {
      flexGrow: 1,
      flexBasis: 0
    },
    ".item-description": {
      flexGrow: 1,
      flexBasis: 0
    },
    ".item-datatype": {
      flexGrow: 0,
      width: "auto",
      minWidth: "70px",
      display: "flex",
      flexDirection: "row",
      gap: "0.25em",
      alignItems: "center"
    },
    ".textfield": {
      margin: "0",
      padding: "0",
      height: "1.75em"
    },
    ".textfield .MuiInputBase-root": {
      borderRadius: "4px",
      height: "1.75em"
    },
    ".textfield input": {
      margin: "0",
      padding: "0.25em 0.5em",
      height: "1.25em",
      fontSize: "var(--fontSizeSmaller)"
    },
    ".select": {
      margin: "0",
      padding: "0",
      border: 0,
      borderRadius: "4px"
    },
    ".select .MuiSelect-select": {
      borderRadius: "8px",
      height: "1.75em",
      margin: "0",
      padding: "0.25em 0.5em",
      fontSize: "var(--fontSizeSmaller)"
    },
    ".select svg": {
      right: "0"
    },
    ".select .MuiOutlinedInput-notchedOutline": {
      border: "0"
    },
    ".delete": {
      margin: "0",
      padding: "0",
      width: "1em",
      minWidth: "1em",
      height: "1em",
      borderRadius: "4px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.c_delete
      },
      "& svg": {
        width: ".7em",
        height: ".7em"
      }
    },
    ".delete-button": {
      padding: "0.1em",
      fontSize: "var(--fontSizeNormal)",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      flexShrink: 0,
      "& svg": {
        fontSize: "var(--fontSizeBig)"
      },
      "&:hover": {
        color: theme.vars.palette.c_delete,
        backgroundColor: "transparent"
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

const ColumnsManager: React.FC<ColumnsManagerProps> = ({
  columns,
  allData,
  onChange
}: ColumnsManagerProps) => {
  const theme = useTheme();
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
      log.warn(
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

  const handleDelete = (index: number) => {
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
    <Grid container spacing={0} css={styles(theme)}>
      <div className="labels">
        <InputLabel className="label-name">Name</InputLabel>
        <InputLabel className="label-datatype">Data Type</InputLabel>
      </div>
      {localColumns.map((field, index) => (
        <Column
          key={index}
          index={index}
          field={field}
          inputRef={(el: HTMLInputElement | null) =>
            (inputRefs.current[index] = el)
          }
          handleNameChange={handleNameChange}
          handleDataTypeChange={handleDataTypeChange}
          handleDescriptionChange={handleDescriptionChange}
          onDelete={() => handleDelete(index)}
          validDataTypes={validDataTypes}
        />
      ))}
    </Grid>
  );
};

export default memo(ColumnsManager, isEqual);
