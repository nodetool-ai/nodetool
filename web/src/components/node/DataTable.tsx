/**
 * A table component that displays data in rows and columns.
 *
 * @param data - An object containing the data to be displayed. The keys represent the columns and
 *               the values represent the rows. Each column has a key and each row has a key.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import Spreadsheet from "react-spreadsheet";
import { DataFrame } from "../../stores/ApiTypes";

const styles = (theme: any) =>
  css({
    "&": { width: "100%", height: "100%", overflow: "auto" },
    ".Spreadsheet": { width: "100%" },
    ".Spreadsheet__table": { width: "100%" }
  });

interface DataTableProps {
  data: DataFrame;
}

const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const { columns, data: rows } = data;

  if (!rows) {
    return <div>No data</div>;
  }
  const _data = rows.map((row) => row.map((cell) => ({ value: cell })));

  return (
    <div className="output" css={styles}>
      <Spreadsheet data={_data} columnLabels={columns || []} />
    </div>
  );
};

export default DataTable;
