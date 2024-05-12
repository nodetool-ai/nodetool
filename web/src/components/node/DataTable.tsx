/**
 * A table component that displays data in rows and columns.
 *
 * @param data - An object containing the data to be displayed. The keys represent the columns and
 *               the values represent the rows. Each column has a key and each row has a key.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo, useState } from "react";
import Spreadsheet from "react-spreadsheet";
import { DataframeRef } from "../../stores/ApiTypes";
import { Button } from "@mui/material";

const styles = (theme: any) =>
  css({
    "&": { width: "100%", height: "100%", overflow: "auto" },
    ".Spreadsheet": { width: "100%" },
    ".Spreadsheet__table": { width: "100%" }
  });

interface DataTableProps {
  dataframe: DataframeRef;
  onChange?: (data: DataframeRef) => void;
}

type TableData = Array<Array<{ value: unknown } | undefined>>;

const DataTable: React.FC<DataTableProps> = ({ dataframe: df, onChange }) => {
  const data: TableData = useMemo(() =>
    df.data?.map((row) => row.map((cell) => ({ value: cell }))) || [],
    [df.data]
  );

  const columnLabels = df.columns?.map((col) => col.name) || [];

  const setData = useCallback((data: TableData) => {
    if (onChange) {
      onChange({
        ...df,
        data: data.map((row) => row.map((cell) => cell?.value))
      });
    }
  }, [df, onChange]);

  return (
    <div className="output" css={styles}>
      <Spreadsheet data={data} columnLabels={columnLabels} onChange={setData} />
    </div>
  );
};

export default DataTable;
