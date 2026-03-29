/**
 * DataTable Component
 *
 * A semantic wrapper around MUI Table components with simplified API
 * for displaying tabular data. Used in asset views, dataframe editors, etc.
 */

import React, { memo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableProps,
  TableCellProps,
  Paper,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SxProps, Theme } from "@mui/material";

// --- DataTable ---

export interface DataTableProps extends Omit<TableProps, "size"> {
  /** Column definitions */
  columns: DataTableColumn[];
  /** Row data */
  rows: Record<string, React.ReactNode>[];
  /** Compact size */
  compact?: boolean;
  /** Sticky header */
  stickyHeader?: boolean;
  /** Max height for scrollable table */
  maxHeight?: number | string;
  /** Container sx */
  containerSx?: SxProps<Theme>;
  /** Callback when a row is clicked */
  onRowClick?: (row: Record<string, React.ReactNode>, index: number) => void;
  /** Key field for row identification */
  rowKey?: string;
  /** Whether to show borders between cells */
  bordered?: boolean;
  /** Whether to stripe alternate rows */
  striped?: boolean;
}

export interface DataTableColumn {
  /** Unique key matching the row data field */
  key: string;
  /** Display header label */
  label: React.ReactNode;
  /** Column width */
  width?: number | string;
  /** Text alignment */
  align?: TableCellProps["align"];
  /** Custom cell renderer */
  render?: (value: React.ReactNode, row: Record<string, React.ReactNode>, index: number) => React.ReactNode;
}

/**
 * DataTable - A themed table for tabular data display
 *
 * @example
 * // Basic table
 * <DataTable
 *   columns={[
 *     { key: "name", label: "Name" },
 *     { key: "type", label: "Type", width: 100 },
 *   ]}
 *   rows={[
 *     { name: "File.txt", type: "text" },
 *     { name: "Image.png", type: "image" },
 *   ]}
 * />
 *
 * @example
 * // Compact striped table with click handler
 * <DataTable
 *   columns={columns}
 *   rows={data}
 *   compact
 *   striped
 *   onRowClick={(row, i) => selectRow(i)}
 *   maxHeight={400}
 * />
 *
 * @example
 * // With custom renderer
 * <DataTable
 *   columns={[
 *     { key: "name", label: "Name" },
 *     { key: "status", label: "Status", render: (val) => <Chip label={val} /> },
 *   ]}
 *   rows={items}
 * />
 */
const DataTableInternal: React.FC<DataTableProps> = ({
  columns,
  rows,
  compact = false,
  stickyHeader = false,
  maxHeight,
  containerSx,
  onRowClick,
  rowKey,
  bordered = false,
  striped = false,
  sx,
  ...props
}) => {
  const theme = useTheme();

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        maxHeight,
        overflow: maxHeight ? "auto" : undefined,
        backgroundColor: "transparent",
        ...containerSx,
      }}
    >
      <Table
        size={compact ? "small" : "medium"}
        stickyHeader={stickyHeader}
        sx={{
          ...(bordered && {
            "& .MuiTableCell-root": {
              borderRight: `1px solid ${theme.palette.divider}`,
              "&:last-child": { borderRight: "none" },
            },
          }),
          ...sx,
        }}
        {...props}
      >
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                align={col.align}
                sx={{
                  width: col.width,
                  fontWeight: 600,
                  fontSize: compact
                    ? theme.fontSizeSmall || "0.875rem"
                    : undefined,
                }}
              >
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={rowKey ? String(row[rowKey]) : index}
              hover={!!onRowClick}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              sx={{
                cursor: onRowClick ? "pointer" : undefined,
                ...(striped &&
                  index % 2 === 1 && {
                    backgroundColor: theme.palette.action.hover,
                  }),
              }}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align}>
                  {col.render
                    ? col.render(row[col.key], row, index)
                    : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export const DataTable = memo(DataTableInternal);
DataTable.displayName = "DataTable";
