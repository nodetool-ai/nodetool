/**
 * A table component that displays data in rows and columns.
 *
 * @param data - An object containing the data to be displayed. The keys represent the columns and
 *               the values represent the rows. Each column has a key and each row has a key.
 */
import React from "react";
import { DataFrame } from "../../stores/ApiTypes";

interface DataTableProps {
  data: DataFrame;
}

const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const { columns, data: rows } = data;

  if (columns === undefined || columns?.length === 0) {
    return <div>No data</div>;
  }

  return (
    <table border={1} cellPadding={5} cellSpacing={0} style={{ margin: 10 }}>
      <thead>
        <tr>
          {columns?.map((col, index) => (
            <th key={index}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows?.map((row: any[], rowIndex: number) => (
          <tr key={rowIndex}>
            {columns?.map((col: string, colIndex: number) => (
              <td key={colIndex}>{row[colIndex]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default DataTable;
