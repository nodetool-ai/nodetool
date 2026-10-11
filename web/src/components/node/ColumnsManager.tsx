/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";
import { Label, BORDER_RADIUS, getSpacingPx, SPACING } from "../ui_primitives";
import { ColumnDef } from "../../stores/ApiTypes";
import isEqual from "../../utils/isEqual";
import Column from "./Column";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      gap: getSpacingPx(SPACING.micro),
      padding: "0",
      backgroundColor: "transparent"
    },
    ".labels": {
      display: "flex",
      flexDirection: "row",
      gap: getSpacingPx(SPACING.md),
      width: "100%",
      padding: `0 0 ${getSpacingPx(SPACING.micro)} 0`,
      margin: "0",
      alignItems: "center"
    },
    ".label-name": {
      flexGrow: 1,
      flexBasis: 0,
      fontSize: "var(--fontSizeSmall)",
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
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.grey[400],
      marginRight: getSpacingPx(SPACING.xxl) // Account for delete button width
    },
    ".column": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      padding: "0",
      margin: `0 0 ${getSpacingPx(SPACING.micro)} 0`,
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
      gap: getSpacingPx(SPACING.xs),
      alignItems: "center"
    },
    ".textfield": {
      margin: "0",
      padding: "0",
      height: "1.75em"
    },
    ".textfield .MuiInputBase-root": {
      borderRadius: BORDER_RADIUS.sm,
      height: "1.75em"
    },
    ".textfield input": {
      margin: "0",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      height: "1.25em",
      fontSize: "var(--fontSizeSmaller)"
    },
    ".select": {
      margin: "0",
      padding: "0",
      border: 0,
      borderRadius: BORDER_RADIUS.sm
    },
    ".select .MuiSelect-select": {
      borderRadius: BORDER_RADIUS.lg,
      height: "1.75em",
      margin: "0",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
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
      borderRadius: BORDER_RADIUS.sm,
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
      padding: getSpacingPx(SPACING.micro),
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

const validDataTypes = ["string", "float", "int", "datetime"];

interface ColumnsManagerProps {
  columns: ColumnDef[];
  onChange: (newColumns: ColumnDef[]) => void;
  /**
   * Replaces `onChange` for deletes, so an owner of positional row data can
   * remove the same index from every row in one write.
   */
  onDeleteColumn?: (index: number) => void;
}

const ColumnsManager: React.FC<ColumnsManagerProps> = ({
  columns,
  onChange,
  onDeleteColumn
}: ColumnsManagerProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const [localColumns, setLocalColumns] = useState(columns);
  // Rows are keyed by position-stable ids, not by name: a name key remounts
  // the row on every keystroke and drops the caret.
  const nextRowIdRef = useRef(0);
  const rowIdsRef = useRef<number[]>([]);
  const rowIds = rowIdsRef.current;
  while (rowIds.length < localColumns.length) {
    rowIds.push(nextRowIdRef.current++);
  }
  rowIds.length = localColumns.length;

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  const handleNameChange = useCallback((index: number, newName: string) => {
    if (localColumns.some((col, i) => i !== index && col.name === newName)) {
      return;
    }
    const newColumns = localColumns.map((col, i) =>
      i === index ? { ...col, name: newName } : col
    );

    setLocalColumns(newColumns);
    onChange(newColumns);
  }, [localColumns, onChange]);

  const handleDescriptionChange = useCallback((index: number, newDescription: string) => {
    const newColumns = localColumns.map((col, i) =>
      i === index ? { ...col, description: newDescription } : col
    );

    setLocalColumns(newColumns);
    onChange(newColumns);
  }, [localColumns, onChange]);

  const handleDataTypeChange = useCallback((index: number, newType: string) => {
    if (!validDataTypes.includes(newType)) {
      return;
    }
    const validatedType = newType as "string" | "float" | "int" | "datetime";

    const newColumns = localColumns.map((col, i) =>
      i === index ? { ...col, data_type: validatedType } : col
    );

    setLocalColumns(newColumns);
    onChange(newColumns);
  }, [localColumns, onChange]);

  const handleDelete = useCallback((index: number) => {
    const newColumns = localColumns.filter((_, i) => i !== index);

    rowIdsRef.current.splice(index, 1);
    setLocalColumns(newColumns);
    if (onDeleteColumn) {
      onDeleteColumn(index);
    } else {
      onChange(newColumns);
    }
  }, [localColumns, onChange, onDeleteColumn]);

  const deleteHandlers = useMemo(
    () => localColumns.map((_, i) => () => handleDelete(i)),
    [localColumns, handleDelete]
  );

  return (
    <div css={cssStyles}>
      <div className="labels">
        <Label className="label-name">Name</Label>
        <Label className="label-datatype">Data Type</Label>
      </div>
      {localColumns.map((field, index) => (
        <Column
          key={rowIds[index]}
          index={index}
          field={field}
          handleNameChange={handleNameChange}
          handleDataTypeChange={handleDataTypeChange}
          handleDescriptionChange={handleDescriptionChange}
          onDelete={deleteHandlers[index]}
          validDataTypes={validDataTypes}
        />
      ))}
    </div>
  );
};

export default memo(ColumnsManager, isEqual);
