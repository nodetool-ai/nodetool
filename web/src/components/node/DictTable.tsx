import React from "react";

interface Props {
  data: Record<string, any>;
}

const DictTable: React.FC<Props> = ({ data }) => {
  return (
    <table cellSpacing={2} cellPadding={5}>
      <tbody>
        {data &&
          Object.entries(data).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{value.toString()}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
};

export default DictTable;
