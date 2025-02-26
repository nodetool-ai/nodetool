import React, { memo, useMemo } from "react";
import { isEqual } from "lodash";
import { NPArray } from "../types";
interface ArrayViewProps {
  array: NPArray;
}

const ArrayView: React.FC<ArrayViewProps> = ({ array }) => {
  const { value, dtype, shape } = array;

  const formattedValue = useMemo(() => {
    if (!value) return "No data";
    if (value.length > 100) {
      return JSON.stringify(value.slice(0, 100)) + "...";
    }
    return JSON.stringify(value, null, 2);
  }, [value]);

  return (
    <div
      style={{
        padding: "16px",
        margin: "8px 0",
        fontFamily: "monospace",
        border: "1px solid #ccc",
        borderRadius: "4px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <h2 style={{ margin: "0 0 8px 0", fontSize: "1.25rem" }}>
        Array ({dtype})
      </h2>
      <p style={{ margin: "0 0 8px 0" }}>Shape: {shape.join(", ")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <pre
          style={{
            padding: "8px",
            borderRadius: "4px",
            overflow: "auto",
            maxHeight: "200px",
            margin: 0,
            backgroundColor: "#f5f5f5",
          }}
        >
          {formattedValue}
        </pre>
      </div>
    </div>
  );
};

export default memo(ArrayView, isEqual);
