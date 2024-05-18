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
import 'react-tabulator/lib/styles.css';
import 'react-tabulator/lib/css/tabulator_midnight.css'
import { ReactTabulator, ColumnDefinition } from 'react-tabulator'

const styles = (theme: any) =>
  css({
    "&": {
    },
  });

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
    <div className="datatable nowheel" css={styles}>
      <ReactTabulator
        events={{ cellEdited: onCellEdited }}
        columns={columns}
        data={data}
        tooltips={true}
        layout={"fitData"}
        height="500px"
      />
    </div>
  );
};

export default DataTable;
