/**
 * A table component that displays data in rows and columns.
 *
 * @param data - An object containing the data to be displayed. The keys represent the columns and
 *               the values represent the rows. Each column has a key and each row has a key.
 */

/** @jsxImportSource @emotion/react */

import React, { useMemo } from "react";
import { css } from "@emotion/react";

import { DataframeRef } from "../../stores/ApiTypes";
import "tabulator-tables/dist/css/tabulator.min.css";
// import "react-tabulator/lib/css/tabulator_site.css";
import "react-tabulator/lib/css/tabulator_midnight.css";
import { ReactTabulator, ColumnDefinition } from "react-tabulator";

const styles = (theme: any) =>
  css({
    "&.datatable": {
      width: "100%",
      height: "calc(100% - 20px)",
      maxHeight: "800px",
      position: "relative",
      overflow: "hidden"
    },
    ".tabulator": {
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1,
      height: "200px"
    },
    ".tabulator-col:hover": {
      backgroundColor: theme.palette.c_gray1
    },
    ".tabulator-tableholder": {
      overflow: "auto"
    },
    ".tabulator .tabulator-col-resize-handle": {
      position: "relative",
      display: "inline-block",
      width: "6px",
      marginLeft: "-3px",
      marginRight: "-3px",
      zIndex: 11,
      verticalAlign: "middle"
    },
    ".tabulator .tabulator-cell.tabulator-editing input": {
      backgroundColor: theme.palette.c_white,
      color: theme.palette.c_black,
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily1
    },
    ".tabulator .tabulator-cell.tabulator-editing input::selection": {
      backgroundColor: theme.palette.c_hl1
    },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        transition: "border 0.2s"
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=ascending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderBottom: "6px solid" + theme.palette.c_hl1
      },
    ".tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort=descending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow":
      {
        borderTop: "6px solid" + theme.palette.c_hl1
      }
  });

interface DataTableProps {
  dataframe: DataframeRef;
  onChange?: (data: DataframeRef) => void;
}

const DataTable: React.FC<DataTableProps> = ({ dataframe: df, onChange }) => {
  const data = useMemo(
    () =>
      df.data?.map((row) =>
        df.columns?.reduce((acc: Record<string, any>, col, index) => {
          acc[col.name] = row[index];
          return acc;
        }, {})
      ) || [],
    [df.columns, df.data]
  );

  const columns: ColumnDefinition[] = useMemo(
    () =>
      df.columns?.map((col) => {
        return {
          title: col.name,
          field: col.name
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
    <div className="datatable nodrag nowheel" css={styles}>
      <ReactTabulator
        data={data}
        columns={columns}
        events={{ cellEdited: onCellEdited }}
        tooltips={true}
        layout={"fitData"}
        height="300px"
        options={{
          movableRows: false,
          movableColumns: true,
          columnDefaults: {
            editor: "input",
            editorParams: {
              elementAttributes: { spellcheck: "false" }
            }
          }
        }}
        // options={{
        //   movableRows: false,
        //   movableColumns: true,
        //   //
        //   selectableRange: 1,
        //   selectableRangeColumns: true,
        //   selectableRangeRows: true,
        //   selectableRangeClearCells: true,
        //   clipboard: true,
        //   clipboardCopyStyled: false,
        //   clipboardCopyConfig: {
        //     rowHeaders: false,
        //     columnHeaders: false
        //   },
        //   clipboardCopyRowRange: "range",
        //   clipboardPasteParser: "range",
        //   clipboardPasteAction: "range",
        //   columnDefaults: {
        //     editTriggerEvent: "dblclick",
        //     editor: "input",
        //     // resizable: "header",
        //     editorParams: {
        //       elementAttributes: { spellcheck: "false" }
        //     }
        //   }
        // }}
      />
    </div>
  );
};

export default DataTable;
