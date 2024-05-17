/**
 * A table component that displays data in rows and columns.
 *
 * @param data - An object containing the data to be displayed. The keys represent the columns and
 *               the values represent the rows. Each column has a key and each row has a key.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo } from "react";

// import Spreadsheet from "react-spreadsheet";
import { Button } from "@mui/material";
import { DataframeRef } from "../../stores/ApiTypes";
import CloseIcon from "@mui/icons-material/Close";
import 'react-tabulator/lib/styles.css';
import 'react-tabulator/lib/css/tabulator_midnight.css'
import { ReactTabulator, ColumnDefinition, ReactTabulatorOptions } from 'react-tabulator'

// const styles = (theme: any) =>
//   css({
//     "&": {
//       display: "flex",
//       flexDirection: "row",
//       width: "100%",
//       height: "100%",
//       maxHeight: "20em",
//       overflow: "auto",
//       position: "relative"
//     },
//     ".row-actions": {
//       position: "absolute",
//       zIndex: 1,
//       top: "0",
//       left: "1px",
//       width: "2.1em",
//       marginTop: "2.4em"
//     },
//     ".delete-row": {
//       opacity: 0,
//       width: "2.1em",
//       minWidth: "unset",
//       height: "2.546em",
//       padding: "0",
//       margin: "0 .5em 0 0",
//       borderRadius: "0",
//       backgroundColor: "transparent",
//       color: theme.palette.c_delete,
//       transition: "opacity 0.2s"
//     },
//     ".delete-row:hover": {
//       color: theme.palette.c_delete,
//       backgroundColor: theme.palette.c_gray2,
//       opacity: 1
//     },
//     ".Spreadsheet": {
//       boxShadow: "none",
//       backgroundColor: "transparent",
//       width: "auto"
//     },
//     ".Spreadsheet__table": {
//       width: "auto"
//     },
//     ".Spreadsheet__header": {
//       minWidth: "2em",
//       maxWidth: "15em",
//       textAlign: "left",
//       border: `1px solid ${theme.palette.c_gray1}`,
//       color: theme.palette.c_gray0,
//       backgroundColor: theme.palette.c_gray3
//     },
//     ".Spreadsheet__cell": {
//       minWidth: "2em",
//       textAlign: "left",
//       border: `1px solid ${theme.palette.c_gray1}`,
//       backgroundColor: theme.palette.c_gray4
//     }
//   });

interface DataTableProps {
  dataframe: DataframeRef;
  onChange?: (data: DataframeRef) => void;
}

const DataTable: React.FC<DataTableProps> = ({ dataframe: df, onChange }) => {
  const data = useMemo(
    () => df.data?.map((row) => df.columns?.reduce((acc: Record<string, any>, col, index) => {
      acc[col.name] = row[index];
      return acc;
    }, {})) || [],
    [df.columns, df.data]
  );

  const columns: ColumnDefinition[] = useMemo(
    () => df.columns?.map((col) => {
      return {
        title: col.name,
        field: col.name,
        editor: "input"
      };
    }) || [],
    [df.columns]
  );

  const onCellEdited = (cell: any) => {
    const newData = data.map((row, index) => {
      if (row === undefined) {
        return [];
      }
      const newRow = df.columns?.map((col) => row[col.name]) || [];
      if (index === cell.getRow().getIndex()) {
        newRow[cell.getColumn().getField()] = cell.getValue();
      }
      return newRow;
    });
    if (onChange) {
      onChange({
        ...df,
        data: newData
      });
    }
  };

  return (
    <div className="datatable nowheel">
      <ReactTabulator
        events={{ cellEdited: onCellEdited }}
        columns={columns}
        data={data}
        tooltips={true}
        layout={"fitData"}
      />
    </div>
  );
};

export default DataTable;
